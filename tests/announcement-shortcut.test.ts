import test from 'node:test';
import assert from 'node:assert/strict';
import { isAnnouncementShortcut } from '../src/announcement-shortcut.js';

const base = {key:'N',code:'KeyN',ctrlKey:true,metaKey:false,shiftKey:true,altKey:false,repeat:false,isComposing:false,defaultPrevented:false};
test('announcement shortcut uses the platform primary modifier and a physical key',()=>{
  assert(isAnnouncementShortcut(base,'Win32'));
  assert(isAnnouncementShortcut(base,'Linux x86_64'));
  assert(isAnnouncementShortcut({...base,ctrlKey:false,metaKey:true},'MacIntel'));
  assert(isAnnouncementShortcut({...base,key:'т'},'Win32'));
  assert(!isAnnouncementShortcut(base,'MacIntel'));
  assert(!isAnnouncementShortcut({...base,ctrlKey:false,metaKey:true},'Win32'));
});
test('normal typing, other shortcuts, repeat and input composition are not intercepted',()=>{
  for(const patch of [{ctrlKey:false},{shiftKey:false},{altKey:true},{metaKey:true},{key:'T',code:'KeyT'},{repeat:true},{isComposing:true},{defaultPrevented:true}]) {
    assert(!isAnnouncementShortcut({...base,...patch},'Win32'),JSON.stringify(patch));
  }
});
