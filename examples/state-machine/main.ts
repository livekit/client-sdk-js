import { mountInspector } from './inspector';
import { machines } from './machines';

mountInspector(document.querySelector('#app') as HTMLElement, machines);
