import { createApp } from 'vue';
import type { ViewerData } from '../src/types';
import App from './App.vue';
import './style.css';

const element = document.getElementById('vrv-data');
if (!element?.textContent) {
  throw new Error('The page has no #vrv-data element with the run data');
}

createApp(App, { data: JSON.parse(element.textContent) as ViewerData }).mount(
  '#app',
);
