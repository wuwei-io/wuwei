import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { AppStore } from '../desktop/renderer/src/team/AppStore.js';
import { BUILTIN_APPS } from '../desktop/main/team/catalog.js';
import { localizeEmployee, resolveEmployee } from '../src/team/default-localization.js';
import '../desktop/renderer/src/theme.css';
const pack = BUILTIN_APPS[0];
let employees = pack.employees.map(e => ({ ...e, fromApp: pack.id }));
const original = structuredClone(employees);
const listeners: Function[] = [];
const state = () => ({ apps: [{ ...pack, installed: true }], employees });
const saves: unknown[] = [];
(window as any).wuwei = {
 onEvent: (fn: Function) => { listeners.push(fn); return () => {}; },
 team: {
 state: async () => state(),
 updateEmployee: async (id: string, patch: object) => {
 saves.push({ id, patch }); employees = employees.map(e => e.id === id ? { ...e, ...patch } : e);
 listeners.forEach(fn => fn('evt:team', state())); return state();
 },
 chat: async () => { throw new Error('Model requests forbidden'); },
 }
};
(window as any).harness = {
 original, saves, employees: () => employees,
 resolve: (name: string) => resolveEmployee(employees, name)?.id,
};
function Harness() {
 const [en, setEn] = useState(true);
 const [list, setList] = useState(employees);
 return <><button id="language" onClick={() => setEn(!en)}>Switch language</button>
 <aside id="fixture-sidebar">{list.map(e => <span key={e.id}>{localizeEmployee(e, en ? 'en' : 'zh').name} </span>)}</aside>
 <select id="fixture-selector">{list.map(e => <option key={e.id} value={e.id}>{localizeEmployee(e, en ? 'en' : 'zh').name}</option>)}</select>
 <AppStore en={en} onEmployees={setList} /></>;
}
createRoot(document.getElementById('root')!).render(<Harness />);
