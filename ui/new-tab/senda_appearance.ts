// Copyright 2026 Senda contributors. All rights reserved.
// Native-only adapter; the standalone preview never imports this module.
import {NewTabPageProxy} from './new_tab_page_proxy.js';

export function getAppearanceHandler() {
  return NewTabPageProxy.getInstance().handler;
}
