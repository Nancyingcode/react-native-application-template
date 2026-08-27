import type { AppModuleFactory } from '../../modules/contracts';
import { QrLoginScreen } from '../../modules/auth/QrLoginScreen';

export const qrLoginPlugin: AppModuleFactory = {
  id: 'qr-login',
  create: () => ({
    id: 'qr-login',
    version: '1.0.0',
    routes: [
      {
        name: 'QrLogin',
        titleKey: 'auth.qr.menu',
        component: QrLoginScreen,
        feature: 'qrLogin',
        requiresAuth: true,
      },
    ],
    menus: [
      {
        id: 'menu.qrLogin',
        labelKey: 'auth.qr.menu',
        route: 'QrLogin',
        order: 20,
        feature: 'qrLogin',
      },
    ],
    login: [
      {
        id: 'login.qrLogin',
        titleKey: 'auth.qr.menu',
        descriptionKey: 'auth.qr.loginDescription',
        route: 'QrLogin',
        order: 20,
        feature: 'qrLogin',
      },
    ],
    translations: {
      'zh-CN': {
        'auth.qr.menu': '扫码登录',
        'auth.qr.loginDescription': '扫描网页登录二维码并核对登录设备',
        'auth.qr.title': '扫描二维码',
        'auth.qr.description': '将登录二维码放入框内，识别后请核对登录设备',
        'auth.qr.securityHint':
          '请勿扫描来源不明的二维码，工作人员不会要求你授权陌生设备',
        'auth.qr.torch': '补光灯',
        'auth.qr.demo': '开发环境：模拟扫码',
        'auth.qr.permission.title': '需要相机权限',
        'auth.qr.permission.description':
          '使用相机扫描网页登录二维码，相机画面不会上传或保存',
        'auth.qr.permission.allow': '允许使用相机',
        'auth.qr.permission.settings': '前往系统设置',
        'auth.qr.permission.privacy':
          '仅在本页面打开相机；离开页面或切到后台后会立即停止。',
        'auth.qr.cameraUnavailable.title': '未找到可用相机',
        'auth.qr.cameraUnavailable.description':
          '请连接带相机的设备后重试。模拟器可能需要配置虚拟相机。',
        'auth.qr.resolving.title': '正在验证登录请求',
        'auth.qr.resolving.description':
          '正在通过安全连接获取设备信息，请稍候。',
        'auth.qr.review.title': '确认登录',
        'auth.qr.review.description':
          '以下设备正在请求登录你的账户，请确认是你本人操作',
        'auth.qr.review.device': '设备',
        'auth.qr.review.location': '位置',
        'auth.qr.review.challenge': '请求编号',
        'auth.qr.review.expires': '{seconds} 秒后失效',
        'auth.qr.review.confirm': '确认登录',
        'auth.qr.review.submitting': '正在确认…',
        'auth.qr.review.cancel': '取消并使请求失效',
        'auth.qr.review.rejecting': '正在取消…',
        'auth.qr.review.warning':
          '如果这不是你的操作，请立即取消并检查账户安全。',
        'auth.qr.success.title': '登录已授权',
        'auth.qr.success.description':
          '浏览器将自动完成登录，你可以安全关闭此页面。',
        'auth.qr.success.done': '完成',
        'auth.qr.error.invalid': '这不是有效的登录二维码，请重新扫描',
        'auth.qr.error.expired': '二维码已失效，请在网页刷新后重新扫描',
        'auth.qr.error.multiple': '画面中有多个二维码，请只保留登录二维码',
        'auth.qr.error.camera': '相机暂时不可用，请稍后重试',
        'auth.qr.error.network': '无法验证登录请求，请检查网络或登录状态后重试',
        'auth.qr.error.reject': '取消失败，请重试或等待二维码自动失效',
      },
      'en-US': {
        'auth.qr.menu': 'Scan to sign in',
        'auth.qr.loginDescription':
          'Scan a web sign-in QR code and verify the requesting device.',
        'auth.qr.title': 'Scan QR code',
        'auth.qr.description':
          'Place the sign-in QR code inside the frame, then verify the requesting device.',
        'auth.qr.securityHint':
          'Only scan a code from a trusted sign-in page. Never approve an unfamiliar device.',
        'auth.qr.torch': 'Light',
        'auth.qr.demo': 'Development: simulate scan',
        'auth.qr.permission.title': 'Camera access required',
        'auth.qr.permission.description':
          'Use the camera to scan a web sign-in QR code. Camera frames are never uploaded or stored.',
        'auth.qr.permission.allow': 'Allow camera access',
        'auth.qr.permission.settings': 'Open system settings',
        'auth.qr.permission.privacy':
          'The camera runs only on this screen and stops when the app moves to the background.',
        'auth.qr.cameraUnavailable.title': 'No camera available',
        'auth.qr.cameraUnavailable.description':
          'Connect a camera-enabled device and try again. An emulator may require a virtual camera.',
        'auth.qr.resolving.title': 'Verifying sign-in request',
        'auth.qr.resolving.description':
          'Securely retrieving device details. Please wait.',
        'auth.qr.review.title': 'Confirm sign in',
        'auth.qr.review.description':
          'This device is requesting access to your account. Confirm that it is yours.',
        'auth.qr.review.device': 'Device',
        'auth.qr.review.location': 'Location',
        'auth.qr.review.challenge': 'Request',
        'auth.qr.review.expires': 'Expires in {seconds}s',
        'auth.qr.review.confirm': 'Confirm sign in',
        'auth.qr.review.submitting': 'Confirming…',
        'auth.qr.review.cancel': 'Cancel and invalidate request',
        'auth.qr.review.rejecting': 'Cancelling…',
        'auth.qr.review.warning':
          'If this was not you, cancel now and review your account security.',
        'auth.qr.success.title': 'Sign in approved',
        'auth.qr.success.description':
          'The browser will complete sign in automatically. You can safely close this screen.',
        'auth.qr.success.done': 'Done',
        'auth.qr.error.invalid':
          'This is not a valid sign-in QR code. Please scan again.',
        'auth.qr.error.expired':
          'This QR code has expired. Refresh the web page and scan again.',
        'auth.qr.error.multiple':
          'Multiple QR codes detected. Keep only the sign-in code in view.',
        'auth.qr.error.camera':
          'The camera is temporarily unavailable. Please try again.',
        'auth.qr.error.network':
          'Unable to verify the request. Check your network or sign-in state and retry.',
        'auth.qr.error.reject':
          'Unable to cancel. Retry or wait for the QR code to expire.',
      },
    },
  }),
};
