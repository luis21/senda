const boot = crypto.randomUUID();
const version = chrome.runtime.getManifest().version;
chrome.runtime.onInstalled.addListener(async ({reason}) => {
  const {installEvents = []} = await chrome.storage.local.get('installEvents');
  await chrome.storage.local.set({installEvents: [...installEvents, {reason, version}].slice(-8)});
});
chrome.runtime.onMessage.addListener((message, sender, reply) => {
  let source;
  try { source = new URL(sender.url); } catch { return false; }
  if (sender.id !== chrome.runtime.id || source.protocol !== 'http:' || source.hostname !== '127.0.0.1') return false;
  (async () => {
    let permissionProbe;
    if (message.action === 'remember') await chrome.storage.local.set({marker: 42});
    else if (message.action === 'block-on') {
      await chrome.declarativeNetRequest.updateDynamicRules({removeRuleIds: [1], addRules: [{
        id: 1, priority: 1, action: {type: 'block'},
        condition: {urlFilter: '/extension-blocked', requestDomains: ['127.0.0.1'], resourceTypes: ['xmlhttprequest']},
      }]});
    } else if (message.action === 'block-off') await chrome.declarativeNetRequest.updateDynamicRules({removeRuleIds: [1]});
    else if (message.action === 'permissions') {
      const read = url => fetch(url, {cache: 'no-store'}).then(response => response.text(), () => 'blocked');
      permissionProbe = {
        allowed: await read(`http://127.0.0.1:${source.port}/permission-probe`),
        denied: await read(`http://localhost:${source.port}/permission-probe`),
      };
    } else if (message.action !== 'probe') throw Error('Unknown synthetic action');
    const stored = await chrome.storage.local.get(['marker', 'installEvents']);
    reply({id: chrome.runtime.id, version, boot, ...stored, permissionProbe,
      rules: await chrome.declarativeNetRequest.getDynamicRules(),
      permissions: await chrome.permissions.getAll(),
      outsidePermission: await chrome.permissions.contains({origins: ['http://localhost/*']}),
    });
  })().catch(error => reply({error: String(error)}));
  return true;
});
