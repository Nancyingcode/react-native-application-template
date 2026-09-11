import { smsTranslations } from './sms/translations';
import type { AppModuleFactory } from '../contracts';
import {
  AccountPasswordLoginScreen,
  ForgotPasswordScreen,
  PhoneLoginScreen,
  RegisterScreen,
} from './AuthMethodScreens';
import { LoginScreen } from './LoginScreen';
import { ProfileScreen } from './ProfileScreen';
import { profileTranslations } from './profileTranslations';
import { logoutTranslations } from './logout/translations';

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
        name: 'Register',
        titleKey: 'auth.register.title',
        component: RegisterScreen,
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
      {
        name: 'Profile',
        titleKey: 'auth.profile.title',
        component: ProfileScreen,
        requiresAuth: true,
      },
    ],
    menus: [
      {
        id: 'menu.login',
        labelKey: 'module.auth.title',
        route: 'Login',
        order: 10,
      },
      {
        id: 'menu.profile',
        labelKey: 'auth.profile.title',
        route: 'Profile',
        order: 90,
        requiresAuth: true,
      },
    ],
    home: [
      {
        id: 'home.profile',
        titleKey: 'auth.profile.title',
        route: 'Profile',
        order: 90,
        requiresAuth: true,
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
        ...smsTranslations['zh-CN'],
        ...logoutTranslations['zh-CN'],
        ...profileTranslations['zh-CN'],
        'module.auth.title': '登录',
        'auth.login.accountPassword.title': '账号密码登录',
        'auth.login.accountPassword.description':
          '使用邮箱和密码登录你的账户。',

        'auth.login.forgotPassword.title': '忘记密码',
        'auth.login.forgotPassword.description':
          '输入账户名或绑定手机号，我们会协助你重置密码。',
        'auth.login.forgotPassword.identifierLabel': '账号或手机号',
        'auth.login.accountPassword.link': '使用账号密码登录',
        'auth.login.account.label': '账号',
        'auth.login.account.placeholder': '请输入账号或邮箱',
        'auth.login.email.label': '邮箱',
        'auth.login.email.placeholder': '请输入邮箱',
        'auth.login.password.label': '密码',
        'auth.login.password.placeholder': '请输入密码',

        'auth.login.submit': '登录',
        'auth.login.submitting': '登录中…',
        'auth.login.error.email': '请输入有效的邮箱地址。',
        'auth.login.error.credentials': '邮箱或密码不正确，请重试。',
        'auth.login.error.disabled': '当前账号不可用，请联系支持人员。',
        'auth.login.error.validation': '请检查邮箱和密码后重试。',
        'auth.login.error.rateLimited': '登录尝试过于频繁，请稍后再试。',
        'auth.login.error.failed': '登录失败，请检查网络后重试。',
        'auth.login.forgotPassword': '忘记密码？',
        'auth.login.forgotPassword.submit': '重置密码',
        'auth.login.backToLogin': '返回账号登录',
        'auth.register.title': '创建账户',
        'auth.register.description': '使用邮箱注册，开启你的购物体验。',
        'auth.register.link': '还没有账户？立即注册',
        'auth.register.password.label': '密码（12–128 位）',
        'auth.register.password.placeholder': '请设置密码',
        'auth.register.password.hint': '须包含大写字母、小写字母、数字和符号。',
        'auth.register.error.passwordStrength':
          '密码须包含大写字母、小写字母、数字和符号。',
        'auth.register.confirmPassword.label': '确认密码',
        'auth.register.confirmPassword.placeholder': '请再次输入密码',
        'auth.register.displayName.label': '昵称（选填）',
        'auth.register.displayName.placeholder': '请输入昵称',
        'auth.register.submit': '注册并登录',
        'auth.register.submitting': '注册中…',
        'auth.register.backToLogin': '已有账户？去登录',
        'auth.register.error.email':
          '请输入有效的邮箱地址（最多 320 个字符）。',
        'auth.register.error.password': '密码长度须为 12–128 位。',
        'auth.register.error.confirmPassword': '两次输入的密码不一致。',
        'auth.register.error.displayName': '昵称最多可填写 100 个字符。',
        'auth.register.error.exists':
          '此邮箱已注册，请直接登录或使用其他邮箱。',
        'auth.register.error.validation': '请检查注册信息后重试。',
        'auth.register.error.rateLimited': '注册尝试过于频繁，请稍后再试。',
        'auth.register.error.failed':
          '注册未完成，请稍后重试；若邮箱已注册，请尝试登录。',
      },
      'en-US': {
        ...smsTranslations['en-US'],
        ...logoutTranslations['en-US'],
        ...profileTranslations['en-US'],
        'module.auth.title': 'Sign in',
        'auth.login.accountPassword.title': 'Sign in with password',
        'auth.login.accountPassword.description':
          'Use your email and password to sign in.',

        'auth.login.forgotPassword.title': 'Forgot password',
        'auth.login.forgotPassword.description':
          'Enter your account or registered phone number to reset your password.',
        'auth.login.forgotPassword.identifierLabel': 'Account or phone number',
        'auth.login.accountPassword.link': 'Use account and password',
        'auth.login.account.label': 'Account',
        'auth.login.account.placeholder': 'Enter account or email',
        'auth.login.email.label': 'Email',
        'auth.login.email.placeholder': 'Enter email',
        'auth.login.password.label': 'Password',
        'auth.login.password.placeholder': 'Enter password',

        'auth.login.submit': 'Sign in',
        'auth.login.submitting': 'Signing in…',
        'auth.login.error.email': 'Enter a valid email address.',
        'auth.login.error.credentials':
          'Incorrect email or password. Try again.',
        'auth.login.error.disabled':
          'This account is unavailable. Please contact support.',
        'auth.login.error.validation':
          'Check your email and password and try again.',
        'auth.login.error.rateLimited':
          'Too many sign-in attempts. Please try again later.',
        'auth.login.error.failed':
          'Unable to sign in. Check your connection and try again.',
        'auth.login.forgotPassword': 'Forgot password?',
        'auth.login.forgotPassword.submit': 'Reset password',
        'auth.login.backToLogin': 'Back to account sign in',
        'auth.register.title': 'Create an account',
        'auth.register.description':
          'Register with your email to start shopping.',
        'auth.register.link': 'New here? Create an account',
        'auth.register.password.label': 'Password (12–128 characters)',
        'auth.register.password.placeholder': 'Create a password',
        'auth.register.password.hint':
          'Include uppercase and lowercase letters, a number and a symbol.',
        'auth.register.error.passwordStrength':
          'Include uppercase and lowercase letters, a number and a symbol.',
        'auth.register.confirmPassword.label': 'Confirm password',
        'auth.register.confirmPassword.placeholder':
          'Enter your password again',
        'auth.register.displayName.label': 'Display name (optional)',
        'auth.register.displayName.placeholder': 'Enter a display name',
        'auth.register.submit': 'Register and sign in',
        'auth.register.submitting': 'Registering…',
        'auth.register.backToLogin': 'Already have an account? Sign in',
        'auth.register.error.email':
          'Enter a valid email address (up to 320 characters).',
        'auth.register.error.password':
          'Use a password with 12–128 characters.',
        'auth.register.error.confirmPassword': 'The passwords do not match.',
        'auth.register.error.displayName':
          'Use a display name with no more than 100 characters.',
        'auth.register.error.exists':
          'This email is already registered. Sign in or use another email.',
        'auth.register.error.validation':
          'Check your registration details and try again.',
        'auth.register.error.rateLimited':
          'Too many registration attempts. Please try again later.',
        'auth.register.error.failed':
          'Registration could not be completed. Try again later, or sign in if your email is already registered.',
      },
    },
  }),
};
