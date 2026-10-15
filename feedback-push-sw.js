/* Worker isolado: recebe apenas avisos de feedback; não altera o cache do app. */
'use strict';
importScripts('https://www.gstatic.com/firebasejs/10.7.1/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.7.1/firebase-messaging-compat.js');
firebase.initializeApp({apiKey:'AIzaSyAdaKNItJ66v0Po_VpQue9huFf_psLmV54',authDomain:'teamms-app.firebaseapp.com',projectId:'teamms-app',messagingSenderId:'57870273303',appId:'1:57870273303:web:1de3016167b9a69dfd4552'});
const labels={weekly_report:'Relatório semanal',monthly_full:'Relatório mensal completo',weekly_diet:'Relatório semanal dieta',weekly_training:'Relatório semanal treino',extra:'Feedback extra'};
firebase.messaging().onBackgroundMessage(payload=>{
  const data=payload?.data||{};
  if(data.kind!=='feedback'||!data.feedbackId)return;
  const title=labels[String(data.feedbackType||'')]||labels.extra;
  return self.registration.showNotification(title,{body:'Você recebeu um novo feedback do treinador.',icon:new URL('./icon-192-v9-8.png',self.location.href).href,badge:new URL('./icon-192-v9-8.png',self.location.href).href,tag:'team-bulls-feedback-'+String(data.feedbackId).slice(0,190),renotify:false,data:{url:new URL('./index.html',self.location.href).href}});
});
self.addEventListener('notificationclick',event=>{
  event.notification.close();
  const url=new URL('./index.html',self.location.href).href;
  event.waitUntil(self.clients.matchAll({type:'window',includeUncontrolled:true}).then(clients=>{
    const existing=clients.find(client=>client.url.startsWith(new URL('./',self.location.href).href));
    return existing?existing.focus():self.clients.openWindow(url);
  }));
});
