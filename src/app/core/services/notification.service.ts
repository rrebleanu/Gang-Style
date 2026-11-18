import { Injectable, signal } from '@angular/core';
import { AppointmentRecord } from '../../shared/models/service-item.model';

export interface InAppBookingToast {
  id: string;
  title: string;
  clientName: string;
  serviceName: string;
  timeLabel: string;
  dateLabel: string;
  barberSlug: string;
  barberName: string;
}

// Handles real-time in-app chime sound, floating toast cards, and native device push notifications.
@Injectable({ providedIn: 'root' })
export class NotificationService {
  private channel: BroadcastChannel | null = null;
  private autoDismissTimer: ReturnType<typeof setTimeout> | null = null;

  // Active in-app banner toast state
  readonly activeToast = signal<InAppBookingToast | null>(null);

  // Permission status: 'granted' | 'denied' | 'default' | 'unsupported'
  readonly permissionStatus = signal<'granted' | 'denied' | 'default' | 'unsupported'>('default');

  // Active barber slug currently monitored by this dashboard session
  readonly monitoredBarberSlug = signal<string>('filip');

  constructor() {
    this.initPermissionState();
    this.initBroadcastChannel();
  }

  // Sets the barber slug whose notifications this dashboard instance should listen for.
  setMonitoredBarber(slug: string): void {
    this.monitoredBarberSlug.set(slug.trim().toLowerCase());
  }

  // Requests native browser/phone notification permission from the barber.
  async requestNotificationPermission(): Promise<boolean> {
    if (typeof window === 'undefined' || !('Notification' in window)) {
      this.permissionStatus.set('unsupported');
      return false;
    }

    try {
      const permission = await Notification.requestPermission();
      this.permissionStatus.set(permission);
      if (permission === 'granted') {
        this.playGentleChime();
        this.showNativeNotification(
          'Notificări Activate · Gang Style',
          'Vei fi notificat instant pe telefon la fiecare programare nouă primită!'
        );
        return true;
      }
      return false;
    } catch {
      return false;
    }
  }

  // Dispatches a new appointment event across tabs and to native device notification.
  broadcastNewAppointment(apt: AppointmentRecord): void {
    const payload: InAppBookingToast = {
      id: apt.id,
      title: 'Ți-a mai intrat o programare!',
      clientName: `${apt.clientLastName} ${apt.clientFirstName}`.trim(),
      serviceName: apt.serviceName,
      timeLabel: `${apt.startTime} - ${apt.endTime}`,
      dateLabel: apt.dateLabel,
      barberSlug: apt.barberSlug.toLowerCase(),
      barberName: apt.barberName,
    };

    // Broadcast across other browser tabs/devices
    if (this.channel) {
      try {
        this.channel.postMessage({ type: 'NEW_BOOKING', payload });
      } catch {
        // BroadcastChannel failed
      }
    }

    // Trigger on current tab if matching barber
    this.handleIncomingNotification(payload);
  }

  // Plays a test alert so the barber can test sound, in-app toast, and phone notification.
  triggerTestNotification(barberName: string, barberSlug: string): void {
    const testPayload: InAppBookingToast = {
      id: 'test-' + Date.now(),
      title: 'Ți-a mai intrat o programare! (Test)',
      clientName: 'Alexandru Popa (Test)',
      serviceName: 'Tuns + Barbă',
      timeLabel: '14:00 - 14:45',
      dateLabel: 'Azi',
      barberSlug: barberSlug.toLowerCase(),
      barberName,
    };
    this.handleIncomingNotification(testPayload, true);
  }

  // Dismisses the active in-app toast banner
  dismissToast(): void {
    if (this.autoDismissTimer) {
      clearTimeout(this.autoDismissTimer);
      this.autoDismissTimer = null;
    }
    this.activeToast.set(null);
  }

  // Synthesizes a gentle luxury bell/chime sound using Web Audio API (0 external dependencies).
  playGentleChime(): void {
    if (typeof window === 'undefined') {
      return;
    }

    try {
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!AudioCtx) {
        return;
      }

      const ctx = new AudioCtx();
      const now = ctx.currentTime;

      // Note 1: E6 (~1318.5 Hz)
      const osc1 = ctx.createOscillator();
      const gain1 = ctx.createGain();
      osc1.type = 'sine';
      osc1.frequency.setValueAtTime(1318.5, now);
      gain1.gain.setValueAtTime(0.09, now);
      gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.35);
      osc1.connect(gain1);
      gain1.connect(ctx.destination);
      osc1.start(now);
      osc1.stop(now + 0.35);

      // Note 2: A6 (~1760 Hz) slightly delayed for a pleasant chime
      const osc2 = ctx.createOscillator();
      const gain2 = ctx.createGain();
      osc2.type = 'sine';
      osc2.frequency.setValueAtTime(1760, now + 0.11);
      gain2.gain.setValueAtTime(0.11, now + 0.11);
      gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.65);
      osc2.connect(gain2);
      gain2.connect(ctx.destination);
      osc2.start(now + 0.11);
      osc2.stop(now + 0.65);
    } catch {
      // Audio playback might be restricted if no user interaction yet
    }
  }

  // Vibrate mobile device (if supported)
  vibratePhone(): void {
    if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
      try {
        navigator.vibrate([160, 90, 160]);
      } catch {
        // Vibration not allowed
      }
    }
  }

  private handleIncomingNotification(payload: InAppBookingToast, isTest = false): void {
    const currentSlug = this.monitoredBarberSlug();
    // Only notify if notification belongs to the active barber or is an explicit test
    if (!isTest && payload.barberSlug !== currentSlug) {
      return;
    }

    // 1. Play sound & vibrate
    this.playGentleChime();
    this.vibratePhone();

    // 2. Display in-app floating toast banner
    this.dismissToast();
    this.activeToast.set(payload);

    // Auto dismiss after 7.5 seconds
    this.autoDismissTimer = setTimeout(() => {
      this.activeToast.set(null);
    }, 7500);

    // 3. Trigger native phone / desktop notification
    this.showNativeNotification(
      'Gang Style Barbershop',
      `💈 Ți-a mai intrat o programare!\n${payload.clientName} • ${payload.serviceName} (${payload.timeLabel})`
    );
  }

  private showNativeNotification(title: string, body: string): void {
    if (
      typeof window !== 'undefined' &&
      'Notification' in window &&
      Notification.permission === 'granted'
    ) {
      try {
        new Notification(title, {
          body,
          icon: '/images/favicon.ico',
          badge: '/images/favicon.ico',
          tag: 'gangstyle-booking-' + Date.now(),
        });
      } catch {
        // Fallback in case constructor is restricted
      }
    }
  }

  private initPermissionState(): void {
    if (typeof window !== 'undefined' && 'Notification' in window) {
      this.permissionStatus.set(Notification.permission);
    } else {
      this.permissionStatus.set('unsupported');
    }
  }

  private initBroadcastChannel(): void {
    if (typeof window !== 'undefined' && 'BroadcastChannel' in window) {
      try {
        this.channel = new BroadcastChannel('gangstyle_booking_notifications');
        this.channel.onmessage = (event) => {
          if (event.data?.type === 'NEW_BOOKING' && event.data.payload) {
            this.handleIncomingNotification(event.data.payload);
          }
        };
      } catch {
        this.channel = null;
      }
    }
  }
}
