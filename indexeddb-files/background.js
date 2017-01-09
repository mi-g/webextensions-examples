
window.browser = window.browser || window.chrome;

browser.browserAction.onClicked.addListener(() => {
  browser.tabs.create({url: "/tab.html"});
});


