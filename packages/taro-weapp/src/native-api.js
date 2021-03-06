import {
  onAndSyncApis,
  noPromiseApis,
  otherApis,
  initPxTransform
} from '@tarojs/taro'
import { cacheDataSet } from './data-cache'
import { queryToJson, getUniqueKey } from './util'
const RequestQueue = {
  MAX_REQUEST: 5,
  queue: [],
  request (options) {
    this.push(options)
    this.run()
  },

  push (options) {
    this.queue.push(options)
  },

  run () {
    if (!this.queue.length) {
      return
    }
    if (this.queue.length <= this.MAX_REQUEST) {
      let options = this.queue.shift()
      let completeFn = options.complete
      options.complete = () => {
        completeFn && completeFn.apply(options, [...arguments])
        this.run()
      }
      wx.request(options)
    }
  }
}

function request (options) {
  options = options || {}
  if (typeof options === 'string') {
    options = {
      url: options
    }
  }
  const originSuccess = options['success']
  const originFail = options['fail']
  const originComplete = options['complete']
  const p = new Promise((resolve, reject) => {
    options['success'] = res => {
      originSuccess && originSuccess(res)
      resolve(res)
    }
    options['fail'] = res => {
      originFail && originFail(res)
      reject(res)
    }

    options['complete'] = res => {
      originComplete && originComplete(res)
    }

    RequestQueue.request(options)
  })
  return p
}

function processApis (taro) {
  const weApis = Object.assign({ }, onAndSyncApis, noPromiseApis, otherApis)
  const useDataCacheApis = {
    'navigateTo': true,
    'redirectTo': true,
    'reLaunch': true
  }
  const routerParamsPrivateKey = '__key_'
  Object.keys(weApis).forEach(key => {
    if (!onAndSyncApis[key] && !noPromiseApis[key]) {
      taro[key] = options => {
        options = options || {}
        let task = null
        let obj = Object.assign({}, options)
        if (typeof options === 'string') {
          return wx[key](options)
        }
        if (useDataCacheApis[key]) {
          const url = obj['url'] = obj['url'] || ''
          const MarkIndex = url.indexOf('?')
          const params = queryToJson(url.substring(MarkIndex + 1, url.length))
          const cacheKey = getUniqueKey()
          obj.url += (MarkIndex > -1 ? '&' : '?') + `${routerParamsPrivateKey}=${cacheKey}`
          cacheDataSet(cacheKey, params)
        }
        const p = new Promise((resolve, reject) => {
          ['fail', 'success', 'complete'].forEach((k) => {
            obj[k] = (res) => {
              options[k] && options[k](res)
              if (k === 'success') {
                resolve(res)
              } else if (k === 'fail') {
                reject(res)
              }
            }
          })
          task = wx[key](obj)
        })
        if (key === 'uploadFile' || key === 'downloadFile') {
          p.progress = cb => {
            task.onProgressUpdate(cb)
            return p
          }
          p.abort = cb => {
            cb && cb()
            task.abort()
            return p
          }
        }
        return p
      }
    } else {
      taro[key] = (...args) => {
        return wx[key].apply(wx, args)
      }
    }
  })
}

function pxTransform (size) {
  const { designWidth, deviceRatio } = this.config
  if (!(designWidth in deviceRatio)) {
    throw new Error(`deviceRatio 配置中不存在 ${designWidth} 的设置！`)
  }
  return parseInt(size, 10) / deviceRatio[designWidth] + 'rpx'
}

function canIUseWebp () {
  const { platform } = wx.getSystemInfoSync()
  const platformLower = platform.toLowerCase()
  if (platformLower === 'android' || platformLower === 'devtools') {
    return true
  }
  return false
}

export default function initNativeApi (taro) {
  processApis(taro)
  taro.request = request
  taro.getCurrentPages = getCurrentPages
  taro.getApp = getApp
  taro.requirePlugin = requirePlugin
  taro.initPxTransform = initPxTransform.bind(taro)
  taro.pxTransform = pxTransform.bind(taro)
  taro.canIUseWebp = canIUseWebp
}
