// index.ts — 绝巅卡状态栏总入口 (照 statusbar-components.md §16 最短路径第 6 步)
// render(d) 调度 -> refreshGameData(isRefreshing 锁) -> 事件(MESSAGE_UPDATED 300ms 防抖 + MESSAGE_RECEIVED 1s 兜底) -> init 一次 -> $(()=>init()) + waitUntil gating
import { state } from './state';
import { waitForMvuReady, readGameData } from './utils/variableReader';
import { renderHero } from './render/hero';
import { renderBond } from './render/bond';
import { renderDungeon } from './render/dungeon';
import { initTabs } from './actions/tabs';
import { initSecondApiPanel } from './actions/secondApiPanel';
import { initDiagPanel } from './actions/diagPanel';
// 全量渲染调度 (§15: 顶层 render(d) 按 Tab 顺序调模块)
function render(sd) {
    state.cachedData = sd; // modal 打开读这个, 不重新异步读
    renderHero(sd);
    renderBond(sd);
    renderDungeon(sd);
}
// 刷新数据 (isRefreshing 锁防并发, statusbar-pitfalls §21)
let refreshTimer = null;
let receiveTimer = null;
async function refreshGameData() {
    if (state.isRefreshing)
        return;
    state.isRefreshing = true;
    try {
        const sd = await readGameData();
        render(sd);
    }
    catch (e) {
        console.warn('[绝巅卡状态栏] 刷新失败', e);
    }
    finally {
        state.isRefreshing = false;
    }
}
// 防抖刷新 (UPDATED 300ms / RECEIVED 1s, pitfalls §21 三重防护)
function scheduleRefreshUpdated() {
    if (refreshTimer)
        clearTimeout(refreshTimer);
    refreshTimer = setTimeout(() => { refreshGameData(); }, 300);
}
function scheduleRefreshReceived() {
    if (receiveTimer)
        clearTimeout(receiveTimer);
    receiveTimer = setTimeout(() => { refreshGameData(); }, 1000);
}
// init
async function init() {
    // gating 两件套 (statusbar.md §3 / §10: 防'读不到变量'白屏)
    await waitForMvuReady(10000);
    // 首次渲染
    await refreshGameData();
    // Tab 切换 + 第二 API 面板 + 诊断面板
    initTabs();
    initSecondApiPanel();
    initDiagPanel();
    // 事件订阅 (§3: 事件驱动刷新)
    try {
        eventOn(tavern_events.MESSAGE_UPDATED, scheduleRefreshUpdated);
        eventOn(tavern_events.MESSAGE_RECEIVED, scheduleRefreshReceived);
        // CHAT_CHANGED 重载 (C1/C2: 切聊天后引用失效)
        eventOn(tavern_events.CHAT_CHANGED, () => {
            // 切聊天后重新 gating + 刷新
            setTimeout(() => { waitForMvuReady(10000).then(refreshGameData); }, 250);
        });
    }
    catch (e) {
        console.warn('[绝巅卡状态栏] 事件订阅失败', e);
    }
}
// 生命周期 (statusbar.md §2: $() 加载, pagehide 卸载, errorCatched 包)
$(() => {
    errorCatched(init)();
});
$(window).on('pagehide', () => {
    // 清理 timer (事件 listener iframe 卸载自动清, pitfalls §21)
    if (refreshTimer)
        clearTimeout(refreshTimer);
    if (receiveTimer)
        clearTimeout(receiveTimer);
    // 诊断 modal 轮询 timer 由 diagPanel 自管, iframe 卸载时其 timer 一并销毁
});
