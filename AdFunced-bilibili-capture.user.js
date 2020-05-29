// ==UserScript==
// @name         AdFunced bilibili capture
// @namespace    dwscdv3
// @version      0.3.0
// @description  Quick screenshot, GIF recording, frame-by-frame seeking, and some other features
// @author       Dwscdv3
// @match        *://www.acfun.cn/v/ac*
// @match        *://www.acfun.cn/bangumi/aa*
// @match        *://www.bilibili.com/video/*
// @match        *://www.bilibili.com/bangumi/play/*
// @require      https://openuserjs.org/src/libs/sizzle/GM_config.js
// @require      https://cdnjs.cloudflare.com/ajax/libs/gif.js/0.2.0/gif.js
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_xmlhttpRequest
// @connect      cdnjs.cloudflare.com
// ==/UserScript==

// TODO:
//   An option to record GIF during video play, not by seeking (much faster, but less accurate)
//   Move JPEG quality parameter from digit keys to settings panel
//   Custom key binding
//   Fancier settings panel

/* global
 *   ClipboardItem
 *   GM_config
 *   GIF
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
        'z': { repeat: true, handler: setMarker },
        'x': { repeat: false, handler: record },
        'ContextMenu': { repeat: false, ctrl: true, handler: GM_config.open.bind(GM_config) },
    };

    // You can add support for more sites by extending this object.
    const SiteSpecificConfig = {
        'www.acfun.cn': {
            onSiteInit: () => {
                siteData.fps = 24;
                setInterval(() => { siteData.fps = Math.max(siteData.fps, parseFloat($('[data-bind-key="decodedFPS"]').textContent)); }, 1000);
            },
            getVideoID: () => location.pathname.match(/(aa|ac)\d+/)[0],
            getFPS: () => siteData.fps,
            videoElementSelector: 'video',
            danmakuElementSelector: '.danmaku-screen',
            danmakuSwitchElementSelector: '.danmaku-enabled',
            danmakuSwitchStyleElementSelector: '.danmaku-enabled',
            progressBarElementSelector: '.wrap-progress',
        },
        'www.bilibili.com': {
            getVideoID: () => bvid,
            getFPS: () => player.getMediaInfo().fps || 30,
            videoElementSelector: '.bilibili-player-video > video',
            danmakuElementSelector: '.bilibili-player-video-danmaku',
            danmakuSwitchElementSelector: '.bilibili-player-video-danmaku-switch > input[type=checkbox]',
            danmakuSwitchStyleElementSelector: '.bilibili-player-video-danmaku-switch > .bui-body',
            progressBarElementSelector: '.bilibili-player-video-progress',
        },
    };

    // ====================================================================================
    // WARNING: You shouldn't change anything below unless you are confident with yourself.
    // ====================================================================================

    const {
        onSiteInit,
        getVideoID,
        getFPS,
        videoElementSelector,
        danmakuElementSelector,
        danmakuSwitchElementSelector,
        danmakuSwitchStyleElementSelector,
        progressBarElementSelector,
    } = SiteSpecificConfig[location.hostname];

    const siteData = {};

    const ScriptIdentifier = 'AdFunced-bilibili-capture';

    const markerID = `${ScriptIdentifier}_marker`;
    const markerHTML = `
<div style="width: 0; border-style: solid; border-width: 6px 5.5px 0; border-color: #66ccff transparent transparent; transform: translate(-6px, -26px)"></div>
<div style="width: 1px; height: 14px; background: #66ccff; transform: translate(-1px, -27px)"></div>
`;

    let gifBeginTime = null;
    let gifWorkerBlob = null;
    let gifWorkerURL = null;

    onSiteInit && onSiteInit();

    GM_config.init({
        id: `${ScriptIdentifier}_settings`,
        title: 'AdFunced bilibili capture - Settings',
        fields: {
            gifHeight: {
                label: 'GIF Height',
                title: 'GIF Height: Width is automatically calculated based on aspect ratio.',
                type: 'int',
                min: 72, max: 1080, default: 360,
            },
            gifFPS: {
                label: 'GIF Target FPS',
                title: 'GIF Target FPS: Due to the limitation of GIF format, you have only a few choices.',
                type: 'select',
                options: [
                    '2',
                    '2.5',
                    '3.33',
                    '4',
                    '5',
                    '6.67',
                    '8.33',
                    '10',
                    '12.5',
                    '16.67',
                    '20',
                    '25',
                    '33.33',
                    '50',
                ],
                default: '8.33',
            },
            gifQuality: {
                label: 'GIF Quality',
                title: 'GIF Quality: Lower is better, and slower. This parameter doesn\'t affect too much.',
                type: 'select',
                options: ['1 (Best Quality)', '2', '3', '4', '5', '6 (Fastest)'],
                default: '2',
            },
            gifDithering: {
                label: 'GIF Dithering',
                title: 'GIF Dithering: Smoother gradient, with slightly increased file size.',
                type: 'checkbox',
                default: false,
            },
        },
        css: `
#${ScriptIdentifier}_settings { background: #eee; }
.field_label { display: inline-block; min-width: 100px; }
`,
    });

    document.addEventListener('keydown', function (event) {
        const mappingInfo = keyMapping[event.key];
        if (mappingInfo
         && ((!mappingInfo.ctrl && !event.ctrlKey) || (mappingInfo.ctrl && event.ctrlKey))
         && (!event.repeat || (event.repeat && mappingInfo.repeat))
         && !(document.activeElement instanceof HTMLTextAreaElement)
         && !(document.activeElement instanceof HTMLInputElement)) {
            if (mappingInfo.preventDefault) event.preventDefault();
            mappingInfo.handler();
        }
    });

    // Preload gif.js Web Worker
    GM_xmlhttpRequest({
        method: 'GET',
        url: 'https://cdnjs.cloudflare.com/ajax/libs/gif.js/0.2.0/gif.worker.js',
        onload: function (response) {
            if (response.status == 200) {
                gifWorkerBlob = new Blob([response.responseText], { type: 'application/javascript' });
                gifWorkerURL = URL.createObjectURL(gifWorkerBlob);
            }
            else {
                alert('Failed to load: gif.worker.js');
            }
        },
    });

    // Replace danmaku switch logic for better experience
    setInterval(function () {
        const danmakuSwitchElement = $(danmakuSwitchElementSelector);
        if (danmakuSwitchElement && !danmakuSwitchElement.dataset.abcLoaded) {
            const newDanmakuSwitchElement = danmakuSwitchElement.cloneNode(true);
            newDanmakuSwitchElement.addEventListener('change', function (event) {
                const danmakuElement = $(danmakuElementSelector);
                danmakuElement.style.visibility = danmakuElement.style.visibility == 'hidden' ? 'visible' : 'hidden';
            });
            newDanmakuSwitchElement.dataset.abcLoaded = 'true';
            danmakuSwitchElement.parentNode.replaceChild(newDanmakuSwitchElement, danmakuSwitchElement);
            $(danmakuSwitchStyleElementSelector).style.filter = 'hue-rotate(140deg)'; // Change color to indicate script load state
        }
    }, 1000);

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
                anchorElement.download =
                    `${getVideoID()}-${Math.floor(seconds / 60).toFixed(0).padStart(2, "0")}-${Math.floor(seconds % 60).toFixed(0).padStart(2, "0")}.${extension}`;
                anchorElement.click();
                URL.revokeObjectURL(blobURL);
            }, mimeType, quality);
        }
    }
    function record() {
        const videoElement = $(videoElementSelector);
        if (gifBeginTime && gifBeginTime >= 0 && gifBeginTime < videoElement.duration) {
            const delta = Math.round(100 / parseFloat(GM_config.get('gifFPS'))) * 10;
            const height = GM_config.get('gifHeight');
            const width = Math.round(height * getAspectRatio());
            const gif = new GIF({
                workers: 2,
                workerScript: gifWorkerURL,
                quality: Math.pow(2, parseInt(GM_config.get('gifQuality')[0]) - 1),
                width: width,
                height: height,
                dither: GM_config.get('gifDithering') ? 'FloydSteinberg' : false,
            });
            const canvasElement = document.createElement('canvas');
            canvasElement.width = width;
            canvasElement.height = height;
            const canvas = canvasElement.getContext('2d');
            canvas.imageSmoothingQuality = 'high';
            let gifEndTime = null;

            videoElement.pause();

            if (videoElement.currentTime >= gifBeginTime) {
                gifEndTime = videoElement.currentTime;
            } else {
                gifEndTime = gifBeginTime;
                gifBeginTime = videoElement.currentTime;
            }

            videoElement.addEventListener('seeked', function onSeeked(event) {
                canvas.drawImage(videoElement, 0, 0, canvasElement.width, canvasElement.height);
                gif.addFrame(canvas, {
                    delay: delta,
                    copy: true,
                });
                if (videoElement.currentTime + delta / 1000 <= gifEndTime) {
                    videoElement.currentTime += delta / 1000;
                } else {
                    videoElement.removeEventListener('seeked', onSeeked);
                    gif.on('finished', function(blob) {
                        window.open(URL.createObjectURL(blob));
                    });
                    gif.render();
                }
            });
            videoElement.currentTime = gifBeginTime;
        }
    }

    function nextFrame() {
        $(videoElementSelector).pause();
        $(videoElementSelector).currentTime += 1 / getFPS();
    }
    function previousFrame() {
        $(videoElementSelector).pause();
        $(videoElementSelector).currentTime -= 1 / getFPS();
    }

    function setMarker() {
        gifBeginTime = $(videoElementSelector).currentTime;
        let markerElement = document.getElementById(markerID);
        if (!markerElement) {
            markerElement = document.createElement('div');
            markerElement.id = markerID;
            markerElement.innerHTML = markerHTML;
            markerElement.style.position = 'absolute';
            markerElement.style.pointerEvents = 'none';
            $(progressBarElementSelector).appendChild(markerElement);
        }
        if (location.hostname === 'www.bilibili.com') {
            markerElement.style.left = `${player.getCurrentTime() / player.getDuration() * 100}%`;
        } else {
            markerElement.style.left = `${$(videoElementSelector).currentTime / $(videoElementSelector).duration * 100}%`;
        }
    }
    function clearMarker() {
        gifBeginTime = null;
        const markerElement = document.getElementById(markerID);
        if (markerElement) markerElement.parentNode.removeChild(markerElement);
    }

    function getAspectRatio() {
        const videoElement = $(videoElementSelector);
        return videoElement.videoWidth / videoElement.videoHeight;
    }

    function $(selector) { return document.querySelector(selector); }
})();
