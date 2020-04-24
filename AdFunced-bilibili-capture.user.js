// ==UserScript==
// @name         AdFunced bilibili capture
// @namespace    dwscdv3
// @version      0.1
// @description  Quick screenshot, frame-by-frame seeking, and some other features
// @author       Dwscdv3
// @match        *://www.bilibili.com/video/*
// @match        *://www.bilibili.com/bangumi/play/*
// @grant        none
// ==/UserScript==

/* global
 *   ClipboardItem
 *   player
 *   bvid
 */

(function() {
    'use strict';

    const keyMapping = {
        'a': { repeat: true, handler: previousFrame },
        'd': { repeat: true, handler: nextFrame },
        'c': { repeat: false, handler: function () { screenshot(); } },
        's': { repeat: false, handler: function () { screenshot('image/png', 'png'); } },
        '1': { repeat: false, handler: function () { screenshot('image/jpeg', 'jpg', 0.1); } },
        '2': { repeat: false, handler: function () { screenshot('image/jpeg', 'jpg', 0.2); } },
        '3': { repeat: false, handler: function () { screenshot('image/jpeg', 'jpg', 0.3); } },
        '4': { repeat: false, handler: function () { screenshot('image/jpeg', 'jpg', 0.4); } },
        '5': { repeat: false, handler: function () { screenshot('image/jpeg', 'jpg', 0.5); } },
        '6': { repeat: false, handler: function () { screenshot('image/jpeg', 'jpg', 0.6); } },
        '7': { repeat: false, handler: function () { screenshot('image/jpeg', 'jpg', 0.7); } },
        '8': { repeat: false, handler: function () { screenshot('image/jpeg', 'jpg', 0.8); } },
        '9': { repeat: false, handler: function () { screenshot('image/jpeg', 'jpg', 0.9); } },
        '0': { repeat: false, handler: function () { screenshot('image/jpeg', 'jpg', 1.0); } },
    };

    const videoElementSelector = '.bilibili-player-video > video';

    function screenshot(mimeType, extension, quality) {
        const videoElement = $(videoElementSelector);
        const canvasElement = document.createElement('canvas');
        canvasElement.width = videoElement.videoWidth;
        canvasElement.height = videoElement.videoHeight;
        const canvas = canvasElement.getContext('2d');
        canvas.drawImage(videoElement, 0, 0, canvasElement.width, canvasElement.height);
        const seconds = videoElement.currentTime;
        canvasElement.toBlob(function (blob) {
            navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
        });
        if (mimeType) {
            canvasElement.toBlob(function (blob) {
                const anchorElement = document.createElement('a');
                const blobURL = URL.createObjectURL(blob);
                anchorElement.href = blobURL;
                anchorElement.download = `${bvid}-${Math.floor(seconds / 60).toFixed(0).padStart(2, "0")}-${Math.floor(seconds % 60).toFixed(0).padStart(2, "0")}.${extension}`;
                anchorElement.click();
                URL.revokeObjectURL(blobURL);
            }, mimeType, quality);
        }
    }

    function nextFrame() {
        player.pause();
        $(videoElementSelector).currentTime += 1 / (player.getMediaInfo().fps || 30);
    }
    function previousFrame() {
        player.pause();
        $(videoElementSelector).currentTime -= 1 / (player.getMediaInfo().fps || 30);
    }

    document.addEventListener('keydown', function (event) {
        const mappingInfo = keyMapping[event.key];
        if (mappingInfo
         && (!event.repeat || (event.repeat && mappingInfo.repeat))
         && !(document.activeElement instanceof HTMLTextAreaElement)
         && !(document.activeElement instanceof HTMLInputElement)) {
            mappingInfo.handler();
        }
    });

    // Replace danmaku switch logic for better experience
    setInterval(function () {
        const danmakuSwitchElement = $('.bilibili-player-video-danmaku-switch > input[type=checkbox]');
        if (danmakuSwitchElement && !danmakuSwitchElement.dataset.abcLoaded) {
            const newDanmakuSwitchElement = danmakuSwitchElement.cloneNode(true);
            newDanmakuSwitchElement.addEventListener('change', function (event) {
                const danmakuElement = $('.bilibili-player-video-danmaku');
                danmakuElement.style.visibility = danmakuElement.style.visibility == 'hidden' ? 'visible' : 'hidden';
            });
            newDanmakuSwitchElement.dataset.abcLoaded = 'true';
            danmakuSwitchElement.parentNode.replaceChild(newDanmakuSwitchElement, danmakuSwitchElement);
            $('.bilibili-player-video-danmaku-switch > .bui-body').style.filter = 'hue-rotate(140deg)'; // Change color to indicate script load state
        }
    }, 1000);

    function $(selector) { return document.querySelector(selector); }
})();
