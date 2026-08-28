import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  Vibration,
  View,
} from 'react-native';
import {
  Camera,
  useCameraDevice,
  useCameraPermission,
} from 'react-native-vision-camera';
import {
  type Barcode,
  type TargetBarcodeFormat,
  useBarcodeScannerOutput,
} from 'react-native-vision-camera-barcode-scanner';
import { useApplication } from '../../app/ApplicationProvider';
import { useAppNavigation } from '../../app/navigation';
import type { ThemeTokens } from '../../brand/types';
import {
  createQrLoginGateway,
  parseQrLoginPayload,
  QrLoginParseError,
  type QrLoginChallenge,
} from './qrLogin';
import { useAppState } from './useAppState';

type ScreenMode =
  | 'scanning'
  | 'resolving'
  | 'reviewing'
  | 'submitting'
  | 'rejecting'
  | 'success';

const QR_BARCODE_FORMATS: TargetBarcodeFormat[] = ['qr-code'];

function getRejectedScanDetails(error: unknown): {
  messageKey: string;
  reason: string;
} {
  if (!(error instanceof QrLoginParseError)) {
    return {
      messageKey: 'auth.qr.error.network',
      reason: 'unknown',
    };
  }

  const messageKey =
    error.code === 'expired'
      ? 'auth.qr.error.expired'
      : 'auth.qr.error.invalid';
  return { messageKey, reason: error.code };
}

export function QrLoginScreen(): React.JSX.Element {
  const { brand, services } = useApplication();
  const navigate = useAppNavigation();
  const styles = useMemo(() => createStyles(brand.theme), [brand.theme]);
  const gateway = useMemo(
    () => createQrLoginGateway(services.http),
    [services.http],
  );
  const appState = useAppState();
  const device = useCameraDevice('back');
  const permission = useCameraPermission();
  const [mode, setMode] = useState<ScreenMode>('scanning');
  const [challenge, setChallenge] = useState<QrLoginChallenge>();
  const [torchEnabled, setTorchEnabled] = useState(false);
  const [cameraStarted, setCameraStarted] = useState(false);
  const [messageKey, setMessageKey] = useState<string>();
  const [secondsRemaining, setSecondsRemaining] = useState<number>();
  const scanLockedRef = useRef(false);
  const lastRejectedAtRef = useRef(0);

  const acceptRawValue = useCallback(
    async (rawValue: string): Promise<void> => {
      if (scanLockedRef.current) {
        return;
      }
      try {
        const request = parseQrLoginPayload(rawValue, brand);
        scanLockedRef.current = true;
        setTorchEnabled(false);
        setMessageKey(undefined);
        setMode('resolving');
        const parsed = await gateway.resolve(request.id);
        setChallenge(parsed);
        setMode('reviewing');
        Vibration.vibrate(45);
        services.analytics.track('qr_login_scanned', {
          hasExpiry: true,
        });
      } catch (error) {
        scanLockedRef.current = false;
        setChallenge(undefined);
        setMode('scanning');
        const now = Date.now();
        if (now - lastRejectedAtRef.current < 1400) {
          return;
        }
        lastRejectedAtRef.current = now;
        const rejectedScan = getRejectedScanDetails(error);
        setMessageKey(rejectedScan.messageKey);
        services.analytics.track('qr_login_rejected', {
          reason: rejectedScan.reason,
        });
      }
    },
    [brand, gateway, services.analytics],
  );

  const handleBarcodes = useCallback(
    (barcodes: Barcode[]) => {
      const detected = barcodes.filter(
        (barcode): barcode is Barcode & { rawValue: string } =>
          Boolean(barcode.rawValue),
      );
      if (detected.length === 1) {
        acceptRawValue(detected[0].rawValue);
      } else if (detected.length > 1) {
        setMessageKey('auth.qr.error.multiple');
      }
    },
    [acceptRawValue],
  );

  const handleScannerError = useCallback(
    (error: Error) => {
      setMessageKey('auth.qr.error.camera');
      services.monitor.capture(error, { screen: 'qr-login' });
    },
    [services.monitor],
  );

  const scannerOutput = useBarcodeScannerOutput({
    barcodeFormats: QR_BARCODE_FORMATS,
    outputResolution: 'preview',
    onBarcodeScanned: handleBarcodes,
    onError: handleScannerError,
  });
  const cameraOutputs = useMemo(() => [scannerOutput], [scannerOutput]);

  const resetScanner = useCallback(() => {
    scanLockedRef.current = false;
    setChallenge(undefined);
    setMessageKey(undefined);
    setSecondsRemaining(undefined);
    setMode('scanning');
  }, []);

  useEffect(() => {
    if (mode !== 'reviewing' || challenge?.expiresAt === undefined) {
      setSecondsRemaining(undefined);
      return;
    }
    const update = (): void => {
      const next = Math.max(
        0,
        Math.ceil((challenge.expiresAt! - Date.now()) / 1000),
      );
      setSecondsRemaining(next);
      if (next === 0) {
        scanLockedRef.current = false;
        setChallenge(undefined);
        setMessageKey('auth.qr.error.expired');
        setMode('scanning');
      }
    };
    update();
    const timer = setInterval(update, 1000);
    return () => clearInterval(timer);
  }, [challenge, mode]);

  const confirmLogin = async (): Promise<void> => {
    if (!challenge || mode === 'submitting') {
      return;
    }
    setMode('submitting');
    setMessageKey(undefined);
    try {
      await gateway.confirm(challenge.id);
      setMode('success');
      services.analytics.track('qr_login_confirmed');
    } catch (error) {
      setMode('reviewing');
      setMessageKey('auth.qr.error.network');
      services.monitor.capture(error, { operation: 'qr-login-confirm' });
    }
  };

  const rejectLogin = async (): Promise<void> => {
    if (!challenge || mode === 'rejecting') {
      return;
    }
    setMode('rejecting');
    setMessageKey(undefined);
    try {
      await gateway.reject(challenge.id);
      services.analytics.track('qr_login_rejected_by_user');
      resetScanner();
    } catch (error) {
      setMode('reviewing');
      setMessageKey('auth.qr.error.reject');
      services.monitor.capture(error, { operation: 'qr-login-reject' });
    }
  };

  if (!permission.hasPermission) {
    return (
      <PermissionState
        canRequest={permission.canRequestPermission}
        onRequest={permission.requestPermission}
        styles={styles}
        t={services.i18n.t.bind(services.i18n)}
      />
    );
  }

  if (device === undefined) {
    return (
      <CenteredState
        mark="!"
        title={services.i18n.t('auth.qr.cameraUnavailable.title')}
        description={services.i18n.t('auth.qr.cameraUnavailable.description')}
        styles={styles}
      />
    );
  }

  if (mode === 'resolving') {
    return (
      <CenteredState
        mark="…"
        title={services.i18n.t('auth.qr.resolving.title')}
        description={services.i18n.t('auth.qr.resolving.description')}
        styles={styles}
      />
    );
  }

  if (mode === 'success') {
    return (
      <CenteredState
        mark="OK"
        title={services.i18n.t('auth.qr.success.title')}
        description={services.i18n.t('auth.qr.success.description')}
        action={services.i18n.t('auth.qr.success.done')}
        onAction={() => navigate('Home')}
        styles={styles}
      />
    );
  }

  const isReviewing = mode === 'reviewing';
  const isSubmitting = mode === 'submitting';
  const isRejecting = mode === 'rejecting';
  const shouldShowReview =
    challenge !== undefined && (isReviewing || isSubmitting || isRejecting);

  if (shouldShowReview) {
    return (
      <ReviewState
        challenge={challenge}
        message={messageKey ? services.i18n.t(messageKey) : undefined}
        secondsRemaining={secondsRemaining}
        submitting={isSubmitting}
        rejecting={isRejecting}
        onConfirm={confirmLogin}
        onCancel={rejectLogin}
        styles={styles}
        t={services.i18n.t.bind(services.i18n)}
      />
    );
  }

  const cameraActive = appState === 'active' && mode === 'scanning';
  let torchMode: 'on' | 'off' | undefined;
  if (cameraStarted) {
    torchMode = torchEnabled ? 'on' : 'off';
  }
  return (
    <View style={styles.scannerRoot}>
      <Camera
        style={StyleSheet.absoluteFill}
        device={device}
        isActive={cameraActive}
        outputs={cameraOutputs}
        torchMode={torchMode}
        onStarted={() => setCameraStarted(true)}
        onStopped={() => setCameraStarted(false)}
        onError={handleScannerError}
      />
      <View pointerEvents="none" style={styles.scannerOverlay}>
        <View style={styles.scannerTopMask}>
          <Text style={styles.scannerTitle}>
            {services.i18n.t('auth.qr.title')}
          </Text>
          <Text style={styles.scannerDescription}>
            {services.i18n.t('auth.qr.description')}
          </Text>
        </View>
        <View style={styles.scannerMiddleRow}>
          <View style={styles.sideMask} />
          <View style={styles.scanFrame}>
            <Corner position="topLeft" styles={styles} />
            <Corner position="topRight" styles={styles} />
            <Corner position="bottomLeft" styles={styles} />
            <Corner position="bottomRight" styles={styles} />
            <View style={styles.scanLine} />
          </View>
          <View style={styles.sideMask} />
        </View>
        <View style={styles.scannerBottomMask}>
          <Text style={styles.securityHint}>
            {services.i18n.t('auth.qr.securityHint')}
          </Text>
          {messageKey ? (
            <View style={styles.inlineMessage}>
              <Text style={styles.inlineMessageText}>
                {services.i18n.t(messageKey)}
              </Text>
            </View>
          ) : null}
        </View>
      </View>
      <View style={styles.scannerActions}>
        {device.hasTorch ? (
          <Pressable
            accessibilityRole="switch"
            accessibilityLabel={services.i18n.t('auth.qr.torch')}
            accessibilityState={{ checked: torchEnabled }}
            onPress={() => setTorchEnabled(value => !value)}
            style={({ pressed }) => [
              styles.circleButton,
              pressed && styles.buttonPressed,
            ]}
          >
            <Text style={styles.circleButtonIcon}>
              {torchEnabled ? 'ON' : 'OFF'}
            </Text>
            <Text style={styles.circleButtonLabel}>
              {services.i18n.t('auth.qr.torch')}
            </Text>
          </Pressable>
        ) : null}
        {__DEV__ ? (
          <Pressable
            accessibilityRole="button"
            onPress={() => {
              scanLockedRef.current = true;
              setTorchEnabled(false);
              setMessageKey(undefined);
              setChallenge({
                id: 'demo_challenge_2026_Aurora',
                deviceName: 'Chrome on Windows',
                location: 'Hong Kong',
                expiresAt: Date.now() + 120_000,
              });
              setMode('reviewing');
              Vibration.vibrate(45);
            }}
            style={({ pressed }) => [
              styles.devButton,
              pressed && styles.buttonPressed,
            ]}
          >
            <Text style={styles.devButtonText}>
              {services.i18n.t('auth.qr.demo')}
            </Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

function PermissionState({
  canRequest,
  onRequest,
  styles,
  t,
}: {
  canRequest: boolean;
  onRequest(): Promise<boolean>;
  styles: ReturnType<typeof createStyles>;
  t(key: string): string;
}): React.JSX.Element {
  return (
    <View style={styles.centeredRoot}>
      <View style={styles.permissionIllustration}>
        <View style={styles.cameraBody}>
          <View style={styles.cameraLens} />
        </View>
      </View>
      <Text style={styles.stateTitle}>{t('auth.qr.permission.title')}</Text>
      <Text style={styles.stateDescription}>
        {t('auth.qr.permission.description')}
      </Text>
      <Pressable
        accessibilityRole="button"
        onPress={async () => {
          await (canRequest ? onRequest() : Linking.openSettings());
        }}
        style={({ pressed }) => [
          styles.primaryButton,
          pressed && styles.buttonPressed,
        ]}
      >
        <Text style={styles.primaryButtonText}>
          {t(
            canRequest
              ? 'auth.qr.permission.allow'
              : 'auth.qr.permission.settings',
          )}
        </Text>
      </Pressable>
      <Text style={styles.privacyCopy}>{t('auth.qr.permission.privacy')}</Text>
    </View>
  );
}

function ReviewState({
  challenge,
  message,
  secondsRemaining,
  submitting,
  rejecting,
  onConfirm,
  onCancel,
  styles,
  t,
}: {
  challenge: QrLoginChallenge;
  message?: string;
  secondsRemaining?: number;
  submitting: boolean;
  rejecting: boolean;
  onConfirm(): Promise<void>;
  onCancel(): Promise<void>;
  styles: ReturnType<typeof createStyles>;
  t(key: string, values?: Record<string, string | number>): string;
}): React.JSX.Element {
  const busy = submitting || rejecting;
  return (
    <ScrollView
      style={styles.stateScroll}
      contentContainerStyle={[styles.centeredRoot, styles.reviewContent]}
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.reviewIcon}>
        <View style={styles.monitorScreen}>
          <View style={styles.monitorDot} />
        </View>
        <View style={styles.monitorStand} />
      </View>
      <Text style={styles.stateTitle}>{t('auth.qr.review.title')}</Text>
      <Text style={styles.stateDescription}>
        {t('auth.qr.review.description')}
      </Text>
      <View style={styles.deviceCard}>
        <DetailRow
          label={t('auth.qr.review.device')}
          value={challenge.deviceName}
          styles={styles}
        />
        {challenge.location ? (
          <DetailRow
            label={t('auth.qr.review.location')}
            value={challenge.location}
            styles={styles}
          />
        ) : null}
        <DetailRow
          label={t('auth.qr.review.challenge')}
          value={`•••• ${challenge.id.slice(-6)}`}
          styles={styles}
        />
      </View>
      {secondsRemaining !== undefined ? (
        <Text style={styles.expiryText}>
          {t('auth.qr.review.expires', { seconds: secondsRemaining })}
        </Text>
      ) : null}
      {message ? <Text style={styles.reviewError}>{message}</Text> : null}
      <Pressable
        accessibilityRole="button"
        disabled={busy}
        onPress={onConfirm}
        style={({ pressed }) => [
          styles.primaryButton,
          busy && styles.buttonDisabled,
          pressed && styles.buttonPressed,
        ]}
      >
        <Text style={styles.primaryButtonText}>
          {t(
            submitting ? 'auth.qr.review.submitting' : 'auth.qr.review.confirm',
          )}
        </Text>
      </Pressable>
      <Pressable
        accessibilityRole="button"
        disabled={busy}
        onPress={onCancel}
        style={({ pressed }) => [
          styles.secondaryButton,
          pressed && styles.buttonPressed,
        ]}
      >
        <Text style={styles.secondaryButtonText}>
          {t(rejecting ? 'auth.qr.review.rejecting' : 'auth.qr.review.cancel')}
        </Text>
      </Pressable>
      <Text style={styles.securityWarning}>{t('auth.qr.review.warning')}</Text>
    </ScrollView>
  );
}

function DetailRow({
  label,
  value,
  styles,
}: {
  label: string;
  value: string;
  styles: ReturnType<typeof createStyles>;
}): React.JSX.Element {
  return (
    <View style={styles.detailRow}>
      <Text style={styles.detailLabel}>{label}</Text>
      <Text style={styles.detailValue}>{value}</Text>
    </View>
  );
}

function CenteredState({
  mark,
  title,
  description,
  action,
  onAction,
  styles,
}: {
  mark: string;
  title: string;
  description: string;
  action?: string;
  onAction?(): void;
  styles: ReturnType<typeof createStyles>;
}): React.JSX.Element {
  return (
    <View style={styles.centeredRoot}>
      <View style={styles.resultMark}>
        <Text style={styles.resultMarkText}>{mark}</Text>
      </View>
      <Text style={styles.stateTitle}>{title}</Text>
      <Text style={styles.stateDescription}>{description}</Text>
      {action && onAction ? (
        <Pressable
          accessibilityRole="button"
          onPress={onAction}
          style={({ pressed }) => [
            styles.primaryButton,
            pressed && styles.buttonPressed,
          ]}
        >
          <Text style={styles.primaryButtonText}>{action}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

function Corner({
  position,
  styles,
}: {
  position: 'topLeft' | 'topRight' | 'bottomLeft' | 'bottomRight';
  styles: ReturnType<typeof createStyles>;
}): React.JSX.Element {
  return <View style={[styles.corner, styles[position]]} />;
}

function createStyles(theme: ThemeTokens) {
  const { colors } = theme;
  return StyleSheet.create({
    scannerRoot: { flex: 1, backgroundColor: '#05070B' },
    scannerOverlay: {
      position: 'absolute',
      top: 0,
      right: 0,
      bottom: 0,
      left: 0,
    },
    scannerTopMask: {
      flex: 1,
      minHeight: 150,
      backgroundColor: 'rgba(5,7,11,0.78)',
      alignItems: 'center',
      justifyContent: 'flex-end',
      paddingHorizontal: 28,
      paddingBottom: 26,
    },
    scannerTitle: {
      color: '#FFFFFF',
      fontSize: 24,
      fontWeight: '600',
      marginBottom: 8,
    },
    scannerDescription: {
      color: '#D4D9E5',
      fontSize: 14,
      lineHeight: 21,
      textAlign: 'center',
    },
    scannerMiddleRow: { height: 252, flexDirection: 'row' },
    sideMask: { flex: 1, backgroundColor: 'rgba(5,7,11,0.78)' },
    scanFrame: { width: 252, height: 252, overflow: 'hidden' },
    scanLine: {
      position: 'absolute',
      top: 124,
      left: 18,
      right: 18,
      height: 2,
      borderRadius: 1,
      backgroundColor: colors.primary,
      shadowColor: colors.primary,
      shadowOpacity: 0.9,
      shadowRadius: 7,
      elevation: 5,
    },
    corner: {
      position: 'absolute',
      width: 34,
      height: 34,
      borderColor: '#FFFFFF',
    },
    topLeft: {
      top: 0,
      left: 0,
      borderTopWidth: 4,
      borderLeftWidth: 4,
      borderTopLeftRadius: 10,
    },
    topRight: {
      top: 0,
      right: 0,
      borderTopWidth: 4,
      borderRightWidth: 4,
      borderTopRightRadius: 10,
    },
    bottomLeft: {
      bottom: 0,
      left: 0,
      borderBottomWidth: 4,
      borderLeftWidth: 4,
      borderBottomLeftRadius: 10,
    },
    bottomRight: {
      bottom: 0,
      right: 0,
      borderBottomWidth: 4,
      borderRightWidth: 4,
      borderBottomRightRadius: 10,
    },
    scannerBottomMask: {
      flex: 1,
      backgroundColor: 'rgba(5,7,11,0.78)',
      alignItems: 'center',
      paddingTop: 24,
      paddingHorizontal: 28,
    },
    securityHint: {
      color: '#BDC4D3',
      fontSize: 12,
      lineHeight: 18,
      textAlign: 'center',
    },
    inlineMessage: {
      marginTop: 14,
      paddingHorizontal: 14,
      paddingVertical: 8,
      borderRadius: 10,
      backgroundColor: 'rgba(255,107,120,0.18)',
    },
    inlineMessageText: { color: '#FFD8DC', fontSize: 12, fontWeight: '600' },
    scannerActions: {
      position: 'absolute',
      left: 0,
      right: 0,
      bottom: 24,
      alignItems: 'center',
      gap: 10,
    },
    circleButton: {
      minWidth: 72,
      height: 58,
      borderRadius: 29,
      paddingHorizontal: 14,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: 'rgba(255,255,255,0.14)',
      borderWidth: 1,
      borderColor: 'rgba(255,255,255,0.22)',
    },
    circleButtonIcon: { color: '#FFFFFF', fontSize: 11, fontWeight: '700' },
    circleButtonLabel: { color: '#FFFFFF', marginTop: 2, fontSize: 10 },
    devButton: {
      paddingHorizontal: 14,
      paddingVertical: 7,
      borderRadius: 12,
      backgroundColor: 'rgba(255,255,255,0.1)',
    },
    devButtonText: { color: '#D7DBE4', fontSize: 11 },
    stateScroll: { flex: 1, backgroundColor: colors.background },
    centeredRoot: {
      flex: 1,
      backgroundColor: colors.background,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 28,
      paddingVertical: 30,
    },
    reviewContent: { flexGrow: 1 },
    permissionIllustration: {
      width: 88,
      height: 88,
      borderRadius: 20,
      backgroundColor: colors.surface,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: 26,
    },
    cameraBody: {
      width: 56,
      height: 40,
      borderRadius: 10,
      backgroundColor: colors.primary,
      alignItems: 'center',
      justifyContent: 'center',
    },
    cameraLens: {
      width: 22,
      height: 22,
      borderRadius: 11,
      borderWidth: 5,
      borderColor: '#FFFFFF',
    },
    stateTitle: {
      color: colors.text,
      fontSize: 24,
      lineHeight: 31,
      fontWeight: '600',
      textAlign: 'center',
      marginBottom: 10,
    },
    stateDescription: {
      color: colors.textMuted,
      fontSize: 14,
      lineHeight: 22,
      textAlign: 'center',
      maxWidth: 360,
    },
    primaryButton: {
      width: '100%',
      maxWidth: 360,
      minHeight: 48,
      marginTop: 26,
      borderRadius: 8,
      backgroundColor: colors.primary,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 20,
    },
    primaryButtonText: { color: '#FFFFFF', fontSize: 14, fontWeight: '600' },
    secondaryButton: {
      width: '100%',
      maxWidth: 360,
      minHeight: 48,
      marginTop: 10,
      borderRadius: 8,
      borderWidth: 1,
      borderColor: colors.border,
      alignItems: 'center',
      justifyContent: 'center',
    },
    secondaryButtonText: {
      color: colors.text,
      fontSize: 14,
      fontWeight: '600',
    },
    buttonPressed: { opacity: 0.72 },
    buttonDisabled: { opacity: 0.55 },
    privacyCopy: {
      color: colors.textMuted,
      fontSize: 11,
      lineHeight: 17,
      textAlign: 'center',
      maxWidth: 330,
      marginTop: 18,
    },
    reviewIcon: {
      width: 88,
      height: 76,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: 16,
    },
    monitorScreen: {
      width: 70,
      height: 48,
      borderRadius: 9,
      borderWidth: 2,
      borderColor: colors.primary,
      alignItems: 'center',
      justifyContent: 'center',
    },
    monitorDot: {
      width: 8,
      height: 8,
      borderRadius: 4,
      backgroundColor: colors.success,
    },
    monitorStand: {
      width: 34,
      height: 8,
      borderTopWidth: 2,
      borderColor: colors.primary,
    },
    deviceCard: {
      width: '100%',
      maxWidth: 360,
      marginTop: 22,
      paddingHorizontal: 16,
      paddingVertical: 8,
      borderRadius: 12,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
    },
    detailRow: {
      minHeight: 42,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 12,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.border,
    },
    detailLabel: { color: colors.textMuted, fontSize: 12 },
    detailValue: {
      color: colors.text,
      fontSize: 13,
      fontWeight: '600',
      flexShrink: 1,
      textAlign: 'right',
    },
    expiryText: { color: colors.warning, fontSize: 12, marginTop: 12 },
    reviewError: {
      color: colors.danger,
      fontSize: 12,
      lineHeight: 18,
      textAlign: 'center',
      marginTop: 12,
    },
    securityWarning: {
      color: colors.textMuted,
      fontSize: 11,
      lineHeight: 17,
      textAlign: 'center',
      maxWidth: 330,
      marginTop: 16,
    },
    resultMark: {
      width: 76,
      height: 76,
      borderRadius: 38,
      backgroundColor: colors.success,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: 24,
    },
    resultMarkText: { color: '#FFFFFF', fontSize: 17, fontWeight: '700' },
  });
}
