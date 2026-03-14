import { notifications } from '@mantine/notifications';

type AppNotificationOptions = {
  id: string;
  color: string;
  title: string;
  message: string;
  autoClose?: number;
};

const APP_NOTIFICATION_CLASS_NAMES = {
  root: 'app-notification',
  title: 'app-notification-title',
  description: 'app-notification-description',
  closeButton: 'app-notification-close',
  body: 'app-notification-body',
  icon: 'app-notification-icon'
} as const;

export function showAppNotification(options: AppNotificationOptions): void {
  notifications.hide(options.id);
  notifications.show({
    ...options,
    radius: 'xl',
    withBorder: true,
    autoClose: options.autoClose ?? 1800,
    classNames: APP_NOTIFICATION_CLASS_NAMES
  });
}
