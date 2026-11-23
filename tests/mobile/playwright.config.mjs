import {defineConfig} from '@playwright/test';
export default defineConfig({
  testDir:'.',testMatch:'*.spec.mjs',timeout:45000,fullyParallel:false,workers:1,
  reporter:[['list'],['html',{open:'never'}]],use:{baseURL:'http://127.0.0.1:43871',trace:'retain-on-failure',screenshot:'only-on-failure'},
  webServer:{command:'node fixture-server.mjs',url:'http://127.0.0.1:43871',reuseExistingServer:false,timeout:15000},
  projects:[
    {name:'android-small',use:{browserName:'chromium',viewport:{width:360,height:800},isMobile:true,hasTouch:true,deviceScaleFactor:2}},
    {name:'iphone-webkit',use:{browserName:'webkit',viewport:{width:390,height:844},isMobile:true,hasTouch:true,deviceScaleFactor:3}},
    {name:'android-large',use:{browserName:'chromium',viewport:{width:412,height:915},isMobile:true,hasTouch:true,deviceScaleFactor:3}}
  ]
});
