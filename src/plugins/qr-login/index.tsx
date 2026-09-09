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
        'auth.qr.back': '返回首页',
        'auth.qr.rescan': '扫描新的二维码',
        'auth.qr.result.title': '授权状态提示',
        'auth.qr.cancelled.title': '已取消授权',
        'auth.qr.cancelled.description':
          '服务器已取消本次授权，电脑无法通过此二维码登录。',
        'auth.qr.consumed.title': '授权已被使用',
        'auth.qr.consumed.description':
          '服务器显示此授权已被电脑兑换，请在电脑端检查登录结果。',
        'auth.qr.error.unknown':
          '请求结果未知，服务器可能已处理。请在电脑端检查结果；不要重复提交。如需重新开始，请由电脑生成新的二维码。',
        'auth.qr.error.owner': '此二维码已绑定其他账号，请在电脑端刷新二维码。',
        'auth.qr.error.status':
          '服务器状态不允许此操作，请在电脑端检查结果或生成新的二维码。',
        'auth.qr.error.auth':
          '手机登录状态不可用，请重新登录后由电脑生成新的二维码。',
        'auth.qr.error.accountChanged':
          '手机会话已改变，本次授权操作已停止。请在电脑端检查结果并生成新的二维码。',
        'auth.qr.error.rate': '请求过于频繁，请稍后由电脑生成新的二维码。',
        'auth.qr.error.used':
          '当前页面已提交过此二维码。请在电脑端检查结果，并扫描新的二维码。',

        'auth.qr.menu': '扫码登录',
        'auth.qr.loginDescription': '扫描电脑二维码并确认授权',
        'auth.qr.title': '扫描二维码',
        'auth.qr.description': '将电脑登录二维码放入框内，识别后请确认授权',
        'auth.qr.securityHint':
          '请勿扫描来源不明的二维码，工作人员不会要求你授权陌生设备',
        'auth.qr.torch': '补光灯',
        'auth.qr.torch.on': '开',
        'auth.qr.torch.off': '关',
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
          '正在验证二维码并绑定当前手机账号，请稍候。',
        'auth.qr.review.title': '确认登录',
        'auth.qr.review.description':
          '此二维码用于授权电脑登录当前手机账号，请确认是你本人操作',
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
          '你已授权电脑登录。电脑仍需完成一次性兑换；手机登录账号保持不变。',
        'auth.qr.error.invalid': '这不是有效的登录二维码，请重新扫描',
        'auth.qr.error.expired': '二维码已失效，请在网页刷新后重新扫描',
        'auth.qr.error.multiple': '画面中有多个二维码，请只保留登录二维码',
        'auth.qr.error.camera': '相机暂时不可用，请稍后重试',
      },
      'en-US': {
        'auth.qr.back': 'Back to home',
        'auth.qr.rescan': 'Scan a new QR code',
        'auth.qr.result.title': 'Authorization status',
        'auth.qr.cancelled.title': 'Authorization cancelled',
        'auth.qr.cancelled.description':
          'The server cancelled this authorization. The computer cannot sign in with this code.',
        'auth.qr.consumed.title': 'Authorization already used',
        'auth.qr.consumed.description':
          'The server reports that the computer redeemed this authorization. Check the computer for the sign-in result.',
        'auth.qr.error.unknown':
          'The outcome is unknown; the server may have processed the request. Check the computer and do not resubmit. Generate a new QR code on the computer to start again.',
        'auth.qr.error.owner':
          'This code belongs to another account. Generate a new code on the computer.',
        'auth.qr.error.status':
          'The server state does not allow this action. Check the computer or generate a new code.',
        'auth.qr.error.auth':
          'Your mobile sign-in is unavailable. Sign in again and generate a new code on the computer.',
        'auth.qr.error.accountChanged':
          'Your mobile session changed. This flow has stopped. Check the computer and generate a new code.',
        'auth.qr.error.rate':
          'Too many requests. Wait before generating a new code on the computer.',
        'auth.qr.error.used':
          'This screen has already submitted this code. Check the computer and scan a new code.',

        'auth.qr.menu': 'Scan to sign in',
        'auth.qr.loginDescription':
          'Scan a computer sign-in code and approve access.',
        'auth.qr.title': 'Scan QR code',
        'auth.qr.description':
          'Place the computer sign-in code inside the frame, then review the authorization.',
        'auth.qr.securityHint':
          'Only scan a code from a trusted sign-in page. Never approve an unfamiliar device.',
        'auth.qr.torch': 'Light',
        'auth.qr.torch.on': 'ON',
        'auth.qr.torch.off': 'OFF',
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
          'Verifying the QR code and binding your current mobile account. Please wait.',
        'auth.qr.review.title': 'Confirm sign in',
        'auth.qr.review.description':
          'This QR code authorizes computer access to your current mobile account. Continue only if you initiated it.',
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
          'Computer sign-in is approved. The computer still needs to redeem it once. Your mobile account is unchanged.',
        'auth.qr.error.invalid':
          'This is not a valid sign-in QR code. Please scan again.',
        'auth.qr.error.expired':
          'This QR code has expired. Refresh the web page and scan again.',
        'auth.qr.error.multiple':
          'Multiple QR codes detected. Keep only the sign-in code in view.',
        'auth.qr.error.camera':
          'The camera is temporarily unavailable. Please try again.',
      },
    },
  }),
};
