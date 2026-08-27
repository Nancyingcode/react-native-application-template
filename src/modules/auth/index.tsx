import type { AppModuleFactory } from '../contracts';
import {
  AccountPasswordLoginScreen,
  ForgotPasswordScreen,
  PhoneLoginScreen,
} from './AuthMethodScreens';
import { LoginScreen } from './LoginScreen';

export const authModule: AppModuleFactory = {
  id: 'auth',
  create: () => ({
    id: 'auth',
    version: '1.0.0',
    routes: [
      {
        name: 'Login',
        titleKey: 'module.auth.title',
        component: LoginScreen,
      },
      {
        name: 'AccountPasswordLogin',
        titleKey: 'auth.login.accountPassword.title',
        component: AccountPasswordLoginScreen,
      },
      {
        name: 'PhoneLogin',
        titleKey: 'auth.login.phone.title',
        component: PhoneLoginScreen,
      },
      {
        name: 'ForgotPassword',
        titleKey: 'auth.login.forgotPassword.title',
        component: ForgotPasswordScreen,
      },
    ],
    menus: [
      {
        id: 'menu.login',
        labelKey: 'module.auth.title',
        route: 'Login',
        order: 10,
      },
    ],
    login: [
      {
        id: 'login.accountPassword',
        titleKey: 'auth.login.accountPassword.title',
        descriptionKey: 'auth.login.accountPassword.description',
        route: 'AccountPasswordLogin',
        order: 10,
      },
      {
        id: 'login.phone',
        titleKey: 'auth.login.phone.title',
        descriptionKey: 'auth.login.phone.description',
        route: 'PhoneLogin',
        order: 20,
      },
    ],
    translations: {
      'zh-CN': {
        'module.auth.title': '登录',
        'auth.login.accountPassword.title': '账号密码登录',
        'auth.login.accountPassword.description':
          '使用账户名和密码登录你的账户。',
        'auth.login.phone.title': '手机号登录',
        'auth.login.phone.description': '使用手机号和验证码快速登录。',
        'auth.login.forgotPassword.title': '忘记密码',
        'auth.login.forgotPassword.description':
          '输入账户名或绑定手机号，我们会协助你重置密码。',
        'auth.login.forgotPassword.identifierLabel': '账号或手机号',
        'auth.login.accountPassword.link': '使用账号密码登录',
        'auth.login.account.label': '账号',
        'auth.login.account.placeholder': '请输入账号或邮箱',
        'auth.login.password.label': '密码',
        'auth.login.password.placeholder': '请输入密码',
        'auth.login.phone.label': '手机号',
        'auth.login.phone.placeholder': '请输入手机号',
        'auth.login.code.label': '验证码',
        'auth.login.code.placeholder': '请输入验证码',
        'auth.login.code.send': '获取验证码',
        'auth.login.code.sent': '已发送',
        'auth.login.submit': '登录',
        'auth.login.forgotPassword': '忘记密码？',
        'auth.login.forgotPassword.submit': '重置密码',
        'auth.login.backToLogin': '返回账号登录',
      },
      'en-US': {
        'module.auth.title': 'Sign in',
        'auth.login.accountPassword.title': 'Sign in with password',
        'auth.login.accountPassword.description':
          'Use your account name and password to sign in.',
        'auth.login.phone.title': 'Sign in with phone',
        'auth.login.phone.description':
          'Use your phone number and verification code to sign in.',
        'auth.login.forgotPassword.title': 'Forgot password',
        'auth.login.forgotPassword.description':
          'Enter your account or registered phone number to reset your password.',
        'auth.login.forgotPassword.identifierLabel': 'Account or phone number',
        'auth.login.accountPassword.link': 'Use account and password',
        'auth.login.account.label': 'Account',
        'auth.login.account.placeholder': 'Enter account or email',
        'auth.login.password.label': 'Password',
        'auth.login.password.placeholder': 'Enter password',
        'auth.login.phone.label': 'Phone number',
        'auth.login.phone.placeholder': 'Enter phone number',
        'auth.login.code.label': 'Verification code',
        'auth.login.code.placeholder': 'Enter code',
        'auth.login.code.send': 'Send code',
        'auth.login.code.sent': 'Sent',
        'auth.login.submit': 'Sign in',
        'auth.login.forgotPassword': 'Forgot password?',
        'auth.login.forgotPassword.submit': 'Reset password',
        'auth.login.backToLogin': 'Back to account sign in',
      },
    },
  }),
};
