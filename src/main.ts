import './style.css'
import { HandThrowApp } from './app'

const root = document.querySelector<HTMLDivElement>('#app')

if (!root) {
  throw new Error('App root missing')
}

new HandThrowApp(root)
