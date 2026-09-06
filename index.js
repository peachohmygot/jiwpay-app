import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.js';
import Admin from './Admin.js';

const root = ReactDOM.createRoot(document.getElementById('root'));

// ระบบแยกลิงก์เข้าใช้งาน
if (window.location.search.includes('admin=true')) {
  root.render(<Admin />); // เข้าหน้าแอดมิน
} else {
  root.render(<App />); // เข้าหน้าร้านค้าปกติ
}
