export const logoutTranslations = {
  'zh-CN': {
    'auth.logout.button': '退出登录',
    'auth.logout.title': '退出当前账号？',
    'auth.logout.description':
      '确认后将立即退出此设备，并请求服务端撤销当前登录会话。',
    'auth.logout.confirm': '确认退出',
    'auth.logout.cancel': '取消',
    'auth.logout.pending': '正在退出并确认远端撤销…',
    'auth.logout.revoked':
      '本地已退出，服务端已确认撤销当前登录会话。',
    'auth.logout.unconfirmed':
      '本地已退出，但远端会话撤销尚未确认。请检查网络；这不代表其他设备或全部会话已退出。',
    'auth.logout.sessionChanged': '会话已变化，未执行此次退出。请重新确认。',
    'auth.logout.localFailed': '本地退出未完成，请重试。',
  },
  'en-US': {
    'auth.logout.button': 'Sign out',
    'auth.logout.title': 'Sign out of this account?',
    'auth.logout.description':
      'This device will sign out immediately. We will then request revocation of the current sign-in session.',
    'auth.logout.confirm': 'Confirm sign out',
    'auth.logout.cancel': 'Cancel',
    'auth.logout.pending': 'Signing out and confirming revocation…',
    'auth.logout.revoked':
      'Signed out locally. The server confirmed revocation of this sign-in session.',
    'auth.logout.unconfirmed':
      'Signed out locally, but remote revocation is unconfirmed. Check your connection. Other devices or sessions may still be signed in.',
    'auth.logout.sessionChanged':
      'The session changed. No sign-out was performed. Please confirm again.',
    'auth.logout.localFailed': 'Local sign-out failed. Please try again.',
  },
};
