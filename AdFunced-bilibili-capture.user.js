// ==UserScript==
// @name         AdFunced bilibili capture
// @namespace    dwscdv3
// @version      1.0.0
// @description  Quick screenshot, GIF recording and frame-by-frame seeking.
// @author       Dwscdv3
// @updateURL    https://github.com/Dwscdv3/AdFunced-bilibili-capture/raw/master/AdFunced-bilibili-capture.user.js
// @downloadURL  https://github.com/Dwscdv3/AdFunced-bilibili-capture/raw/master/AdFunced-bilibili-capture.user.js
// @homepageURL  https://dwscdv3.com/
// @supportURL   https://github.com/Dwscdv3/AdFunced-bilibili-capture
// @license      GPL-3.0-or-later
// @match        *://*/*
// @require      https://openuserjs.org/src/libs/sizzle/GM_config.js
// @require      https://cdnjs.cloudflare.com/ajax/libs/gif.js/0.2.0/gif.js
// @require      https://cdnjs.cloudflare.com/ajax/libs/pica/6.1.1/pica.min.js
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_xmlhttpRequest
// @connect      cdnjs.cloudflare.com
// ==/UserScript==

// TODO:
//   Video recording
//   An option to record GIF during video play, not by seeking (much faster, but less accurate)
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

    const ProductName = 'ABC';

    const keyMapping = {
        'a': { repeat: true, handler: function () { video.previousFrame(); } },
        'd': { repeat: true, handler: function () { video.nextFrame(); } },
        'c': { ctrl: true, repeat: false, handler: function () { if (!getSelection().toString()) capture.screenshot(); } },
        's': { repeat: false, handler: function () {
            switch (GM_config.get('imageFormat')) {
                case 'JPEG':
                    capture.screenshot('image/jpeg', 'jpg', Number(GM_config.get('jpegQuality') / 100));
                    break;
                case 'PNG':
                    capture.screenshot('image/png', 'png');
                    break;
                default:
                    throw new Error('Invalid image format.');
            }
        } },
        'z': { repeat: true, handler: function () { UI.setMarker(); } },
        'x': { repeat: false, handler: function () { capture.record(); } },
        'ContextMenu': { ctrl: true, repeat: false, handler: GM_config.open.bind(GM_config) },
    };

    // You can add support for more sites by extending this object.
    const SiteProfiles = {
        'www.bilibili.com': {
            video: {
                getId() { return bvid; },
                getDuration() { return player.getDuration(); },
                getCurrentTime() { return player.getCurrentTime(); },
            },
            UI: {
                progressBarElementSelector: '.bilibili-player-video-progress',
            },
        },
        'www.acfun.cn': {
            video: {
                getId() { return location.pathname.match(/(aa|ac)\d+/)[0]; },
            },
            UI: {
                progressBarElementSelector: '.wrap-progress',
            },
        },
        'www.youtube.com': {
            video: {
                getId() { return new URL(location).searchParams.get('v'); },
            },
            UI: {
                progressBarElementSelector: '.ytp-progress-bar',
            },
        },
    };

    const Default = {
        video: {
            videoElementSelector: 'video',
            lastFrameMediaTime: 0,
            frameTimeHistory: [],
            _currentVideoElement: null,
            _highestFPS: 0,
            videoFrameCallbackHandler(now, metadata) {
                const videoElement = this.getBaseElement();
                if (videoElement) {
                    const deltaTime = metadata.mediaTime - this.lastFrameMediaTime;
                    this.lastFrameMediaTime = metadata.mediaTime;
                    if (deltaTime > 0.006 && deltaTime <= 0.25) {
                        this.frameTimeHistory.unshift(deltaTime);
                        if (this.frameTimeHistory.length > 60) {
                            this.frameTimeHistory.pop();
                            this._highestFPS = Math.max(this._highestFPS, this.frameTimeHistory.length / (this.frameTimeHistory.reduce((total, next) => total + next)));
                            console.log(this._highestFPS);
                        }
                    }
                    videoElement.requestVideoFrameCallback(this.videoFrameCallbackHandler);
                }
            },
            getBaseElement() { return $(this.videoElementSelector); },
            getId() { return `${location.hostname}-${location.pathname.substring(location.pathname.lastIndexOf('/') + 1).replace(/\.html?$/, '')}`; },
            getPaused() { return this.getBaseElement().paused; },
            getDuration() { return this.getBaseElement().duration; },
            getCurrentTime() { return this.getBaseElement().currentTime; },
            getAspectRatio() { return this.getBaseElement().videoWidth / this.getBaseElement().videoHeight; },
            getFPS() { return this.frameTimeHistory.length === 0 ? 60 : this._highestFPS; },
            nextFrame() {
                this.getBaseElement().pause();
                this.getBaseElement().currentTime += 1 / this.getFPS();
            },
            previousFrame() {
                this.getBaseElement().pause();
                this.getBaseElement().currentTime -= 1 / this.getFPS();
            },
        },
        capture: {
            beginTime: null,
            screenshot(mimeType, extension, quality) {
                const videoElement = video.getBaseElement();
                const canvasElement = createElement('canvas', {
                    width: videoElement.videoWidth,
                    height: videoElement.videoHeight,
                });
                const canvas = canvasElement.getContext('2d');
                canvas.drawImage(videoElement, 0, 0, canvasElement.width, canvasElement.height);
                const seconds = videoElement.currentTime;
                canvasElement.toBlob(function (blob) {
                    navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
                });
                if (mimeType) {
                    canvasElement.toBlob(function (blob) {
                        const blobURL = URL.createObjectURL(blob);
                        const anchorElement = createElement('a', {
                            href: blobURL,
                            download: `${video.getId()}-${Math.floor(seconds / 60).toFixed(0).padStart(2, "0")}-${Math.floor(seconds % 60).toFixed(0).padStart(2, "0")}.${extension}`,
                        });
                        anchorElement.click();
                        URL.revokeObjectURL(blobURL);
                    }, mimeType, quality);
                }
            },
            record() {
                const videoElement = video.getBaseElement();
                if (this.beginTime && this.beginTime >= 0 && this.beginTime < videoElement.duration) {
                    const delta = Math.round(100 / parseFloat(GM_config.get('gifFPS'))) * 10;
                    const height = GM_config.get('gifHeight');
                    const width = Math.round(height * video.getAspectRatio());
                    const gif = new GIF({
                        workers: 2,
                        workerScript: gifjs.workerURL,
                        quality: Math.pow(2, parseInt(GM_config.get('gifQuality')[0]) - 1),
                        width: width,
                        height: height,
                        dither: GM_config.get('gifDithering') ? 'FloydSteinberg' : false,
                    });

                    const canvasElement = createElement('canvas', {
                        width: videoElement.videoWidth,
                        height: videoElement.videoHeight,
                    });
                    const canvas = canvasElement.getContext('2d');
                    canvas.imageSmoothingQuality = 'high';

                    const canvasResizedElement = createElement('canvas', {
                        width,
                        height,
                    });
                    const canvasResized = canvasResizedElement.getContext('2d');
                    canvasResized.imageSmoothingQuality = 'high';

                    let endTime = null;

                    videoElement.pause();

                    if (Default.video.getCurrentTime() >= this.beginTime) {
                        endTime = Default.video.getCurrentTime();
                    } else {
                        endTime = this.beginTime;
                        this.beginTime = Default.video.getCurrentTime();
                    }

                    videoElement.addEventListener('seeked', async function onSeeked(event) {
                        canvas.drawImage(videoElement, 0, 0, canvasElement.width, canvasElement.height);
                        await pica.resize(canvasElement, canvasResizedElement, { quality: 1 });
                        gif.addFrame(canvasResized, {
                            delay: delta,
                            copy: true,
                        });
                        if (videoElement.currentTime + delta / 1000 <= endTime) {
                            videoElement.currentTime += delta / 1000;
                        } else {
                            videoElement.removeEventListener('seeked', onSeeked);
                            gif.on('start', function() {
                                UI.encodingProgressElement.textContent = `Encoding... 0%`;
                                document.body.append(UI.encodingProgressElement);
                            });
                            gif.on('progress', function(progress) {
                                UI.encodingProgressElement.textContent = `Encoding... ${Math.round(progress * 100)}%`;
                            });
                            gif.on('finished', function(blob) {
                                UI.encodingProgressElement.remove();
                                window.open(URL.createObjectURL(blob));
                            });
                            gif.render();
                        }
                    });
                    videoElement.currentTime = this.beginTime;
                }
            },
        },
        UI: {
            progressBarElementSelector: null,
            markerElement: createElement('div', {
                id: `${ProductName}-marker`,
                styles: {
                    position: 'absolute',
                    pointerEvents: 'none',
                },
                children: [
                    createElement('div', {
                        styles: {
                            width: '0',
                            borderStyle: 'solid',
                            borderWidth: '6px 5.5px 0',
                            borderColor: '#66ccff transparent transparent',
                            transform: 'translate(-6px, -26px)',
                        },
                    }),
                    createElement('div', {
                        styles: {
                            width: '1px',
                            height: '14px',
                            background: '#66ccff',
                            transform: 'translate(-1px, -27px)',
                        },
                    }),
                ],
            }),
            encodingProgressElement: createElement('div', {
                id: `{ProductName}-progress`,
                styles: {
                    position: 'fixed',
                    left: '50%',
                    top: '50%',
                    transform: 'translate(-50%, -50%)',
                    zIndex: '10000',
                    padding: '0.8em 1em',
                    color: '#eee',
                    background: '#0009',
                    borderRadius: '0.5em',
                    fontSize: '150%',
                },
            }),
            setMarker() {
                capture.beginTime = Default.video.getCurrentTime();
                if ($(UI.progressBarElementSelector)) {
                    $(UI.progressBarElementSelector).append(this.markerElement);
                    this.markerElement.style.left = `${video.getCurrentTime() / video.getDuration() * 100}%`;
                }
            },
            clearMarker() {
                capture.beginTime = null;
                this.markerElement.remove();
            },
        },
        gifjs: {
            workerBlob: null,
            workerURL: null,
        },
        onSiteInit() {},
    };

    const ABC = SiteProfiles[location.host] ? deepMerge(Default, SiteProfiles[location.host]) : Default;
    bindAll(Default);
    bindAll(ABC);
    const { video, capture, UI, gifjs, onSiteInit } = unsafeWindow[ProductName] = ABC;

    const pica = window.pica({ tile: 8192 });

    onSiteInit && onSiteInit();

    GM_config.init({
        id: `${ProductName}_settings`,
        title: 'AdFunced bilibili capture - Settings',
        fields: {
            imageFormat: {
                label: 'Image Format',
                title: 'Image Format: PNG is lossless, while JPEG is more space-efficient.',
                section: 'Screenshot',
                type: 'select',
                options: [
                    'JPEG',
                    'PNG',
                ],
                default: 'JPEG',
            },
            jpegQuality: {
                label: 'JPEG Quality',
                title: 'JPEG Quality: Values between 60 - 95 is recommended.',
                type: 'int',
                min: 0, max: 100, default: 80,
            },
            gifHeight: {
                label: 'GIF Height',
                title: 'GIF Height: Width is automatically calculated based on aspect ratio.',
                section: 'GIF Recording',
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
            #${ProductName}_settings { background: #eee; }
            .field_label { display: inline-block; min-width: 100px; }
        `,
    });

    document.addEventListener('keydown', function (event) {
        const mappingInfo = keyMapping[event.key];
        if (mappingInfo
         && ((!mappingInfo.ctrl && !event.ctrlKey) || (mappingInfo.ctrl && event.ctrlKey))
         && ((!mappingInfo.alt && !event.altKey) || (mappingInfo.alt && event.altKey))
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
                gifjs.workerBlob = new Blob([response.responseText], { type: 'application/javascript' });
                gifjs.workerURL = URL.createObjectURL(gifjs.workerBlob);
            }
            else {
                alert('Failed to load: gif.worker.js');
            }
        },
    });

    setInterval(function () {
        const videoElement = video.getBaseElement();
        if (videoElement && videoElement !== video._currentVideoElement) {
            video._highestFPS = 0;
            video.frameTimeHistory = [];
            video._currentVideoElement = videoElement;
            videoElement.requestVideoFrameCallback(video.videoFrameCallbackHandler);
        }
    }, 100);

    function $(selector) {
        return document.querySelector(selector);
    }
    function createElement(type, args) {
        const element = document.createElement(type);
        for (const prop in args) {
            const arg = args[prop];
            if (prop === 'classList' && arg instanceof Array) {
                element.classList.add(...arg.filter(cls => cls));
            } else if (prop === 'children' && arg instanceof Array) {
                element.append(...arg.filter(child => child != null));
            } else if (prop === 'styles' && arg instanceof Object) {
                Object.assign(element.style, arg);
            } else if (prop.startsWith('attr_')) {
                element.setAttribute(prop.substring(5), arg);
            } else if (prop.startsWith('on')) {
                element.addEventListener(prop.substring(2), arg);
            } else {
                element[prop] = arg;
            }
        }
        return element;
    }
    function when(predicate, interval = 100) {
        return new Promise((resolve, reject) => {
            const timer = setInterval(() => {
                if (predicate()) {
                    clearInterval(timer);
                    resolve();
                }
            }, interval);
        });
    }
    function bindAll(obj) {
        for (const [key, value] of Object.entries(obj)) {
            if (typeof value === 'function') {
                obj[key] = value.bind(obj);
            } else if (value && typeof value === 'object') {
                bindAll(value);
            }
        }
    }
    function deepMerge(obj1, obj2) {
        const mergedSubobjects = {};
        for (const key in obj2) {
            if (obj1[key] && typeof obj1[key] === 'object' && Object.getPrototypeOf(obj1[key]) === Object.prototype &&
                obj2[key] && typeof obj2[key] === 'object' && Object.getPrototypeOf(obj2[key]) === Object.prototype) {
                mergedSubobjects[key] = deepMerge(obj1[key], obj2[key]);
            }
        }
        return Object.assign({}, obj1, obj2, mergedSubobjects);
    }
})();
