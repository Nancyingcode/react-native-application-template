import React, { useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, View } from 'react-native';
import type { createStyles } from '../shared/form';

export function SmsKeyboardLayout({
  children,
  styles,
}: React.PropsWithChildren<{
  styles: ReturnType<typeof createStyles>;
}>): React.JSX.Element {
  const container = useRef<View>(null);
  const [keyboardOffset, setKeyboardOffset] = useState(0);
  return (
    <View
      collapsable={false}
      onLayout={() => {
        // 与已有注册页一致：键盘使用窗口坐标，需计入宿主导航头部的实际高度。
        container.current?.measureInWindow((_x, y) => setKeyboardOffset(y));
      }}
      ref={container}
      style={styles.root}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={keyboardOffset}
        style={styles.root}
      >
        {children}
      </KeyboardAvoidingView>
    </View>
  );
}
