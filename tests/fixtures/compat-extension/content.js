document.documentElement.dataset.sendaExtension = chrome.runtime.getManifest().version;
window.addEventListener('senda-compat-request', async event => {
  if (typeof event.detail !== 'string') return;
  let request;
  try { request = JSON.parse(event.detail); } catch { return; }
  if (!request || typeof request.token !== 'string') return;
  let response;
  try { response = await chrome.runtime.sendMessage({action: request.action}); }
  catch (error) { response = {error: String(error)}; }
  window.dispatchEvent(new CustomEvent('senda-compat-response', {
    detail: JSON.stringify({token: request.token, response}),
  }));
});
