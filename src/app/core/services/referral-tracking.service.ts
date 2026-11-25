import { Injectable, signal } from '@angular/core';

/**
 * ActiveReferral represents the attribution state captured when a client lands on the site.
 * It identifies the marketing channel or personal referral that brought the client in.
 */
export interface ActiveReferral {
  /** Normalized source identifier: WHATSAPP_SHARE, INSTAGRAM_BIO, FRIEND_REF, BARBER_FILIP, BARBER_SEBI, DIRECT_ORGANIC, REF_CODE */
  source: string;
  /** Optional custom referral code or promoter name (e.g., "alex", "gangstyle") */
  code?: string;
  /** Human-readable Romanian label for UI badges and CRM tables */
  label: string;
  /** Timestamp when the referral attribution was recorded */
  timestamp: number;
}

/**
 * ReferralLinkOption defines preset marketing links that the administrator can copy
 * and share on social media, WhatsApp groups, or print on salon QR cards.
 */
export interface ReferralLinkOption {
  key: string;
  label: string;
  param: string;
  url: string;
  icon: string;
  description: string;
}

/**
 * ReferralTrackingService
 * -----------------------
 * Handles client acquisition tracking across the entire booking journey:
 * 1. Automatically inspects incoming query parameters (?ref=..., ?source=..., ?utm_source=...).
 * 2. Normalizes parameters into standardized attribution categories.
 * 3. Persists attribution in localStorage so it survives page refreshes and multi-step navigation.
 * 4. Injects referral data into booking and registration payloads.
 */
@Injectable({ providedIn: 'root' })
export class ReferralTrackingService {
  /** LocalStorage key for persisting the client's referral source across browser sessions */
  private readonly storageKey = 'gangstyle_referral_info';

  /** Reactive signal holding the currently active referral attribution */
  readonly currentReferral = signal<ActiveReferral>(this.loadStoredReferral());

  constructor() {
    // Automatically inspect the URL on service instantiation
    this.captureFromUrl();
  }

  /**
   * Scans window.location.search for marketing referral tags.
   * If a referral query parameter is present, it normalizes and persists it in localStorage.
   * 
   * Intermediate logic details:
   * - Checks ?ref, ?source, and ?utm_source for maximum compatibility with social platforms.
   * - Maps informal abbreviations ('wa' -> 'WHATSAPP_SHARE', 'ig' -> 'INSTAGRAM_BIO').
   * - Distinguishes between known channels and arbitrary personal codes (?ref=alex -> REF_CODE).
   */
  captureFromUrl(): ActiveReferral {
    if (typeof window === 'undefined' || !window.location) {
      return this.currentReferral();
    }

    try {
      const urlParams = new URLSearchParams(window.location.search);
      const refParam = urlParams.get('ref') || urlParams.get('source') || urlParams.get('utm_source');

      if (refParam && refParam.trim()) {
        const cleanParam = refParam.trim().toLowerCase();
        let source = 'DIRECT_ORGANIC';
        let label = 'Direct / Căutare Google';
        let code: string | undefined = undefined;

        // Categorize based on normalized parameter value
        if (cleanParam === 'whatsapp' || cleanParam === 'wa') {
          source = 'WHATSAPP_SHARE';
          label = 'Recomandare WhatsApp';
        } else if (cleanParam === 'instagram' || cleanParam === 'insta' || cleanParam === 'ig') {
          source = 'INSTAGRAM_BIO';
          label = 'Instagram Bio / Story';
        } else if (cleanParam === 'maps' || cleanParam === 'google_maps' || cleanParam === 'gmb') {
          source = 'GOOGLE_MAPS';
          label = 'Google Maps & Local Business';
        } else if (cleanParam === 'prieten' || cleanParam === 'friend' || cleanParam === 'recomandare') {
          source = 'FRIEND_REF';
          label = 'Recomandare Prieten';
        } else if (cleanParam === 'filip') {
          source = 'BARBER_FILIP';
          label = 'Link Frizer Filip';
        } else if (cleanParam === 'sebi') {
          source = 'BARBER_SEBI';
          label = 'Link Frizer Sebi';
        } else if (cleanParam === 'google' || cleanParam === 'organic' || cleanParam === 'maps') {
          source = 'GOOGLE_SEARCH';
          label = 'Google Search / Maps';
        } else {
          // Custom promoter or friend referral code
          source = 'REF_CODE';
          code = refParam.trim();
          label = `Recomandat de: ${refParam.trim()}`;
        }

        const active: ActiveReferral = {
          source,
          code,
          label,
          timestamp: Date.now(),
        };

        this.saveReferral(active);
        return active;
      }
    } catch {
      // Gracefully ignore errors in SSR or restricted iframe/sandbox environments
    }

    return this.currentReferral();
  }

  /**
   * Retrieves the active referral attribution.
   * If no explicit referral was captured, returns DIRECT_ORGANIC as default baseline.
   */
  getActiveReferral(): ActiveReferral {
    const stored = this.currentReferral();
    if (stored && stored.source) {
      return stored;
    }
    return {
      source: 'DIRECT_ORGANIC',
      label: 'Direct / Căutare Google',
      timestamp: Date.now(),
    };
  }

  /**
   * Generates preset shareable marketing URLs for the Admin dashboard.
   * Dynamically adapts to the live production domain and salon barbers from the database.
   */
  getShareableLinks(
    baseUrl?: string,
    barberList?: Array<{ name: string; slug: string }>
  ): ReferralLinkOption[] {
    // Dynamically detect domain: in production, use active browser origin; during local dev, default to https://gangstyle.ro
    let origin = baseUrl;
    if (!origin && typeof window !== 'undefined' && window.location) {
      const current = window.location.origin;
      if (!current.includes('localhost') && !current.includes('127.0.0.1')) {
        origin = current;
      }
    }
    origin = origin || 'https://gangstyle.ro';

    const baseLinks: ReferralLinkOption[] = [
      {
        key: 'MAPS',
        label: 'Google Maps & Business',
        param: 'ref=maps',
        url: `${origin}?ref=maps`,
        icon: '📍',
        description: 'Pentru butonul „Rezervă” sau „Website” din profilul Google Business & Maps',
      },
      {
        key: 'WHATSAPP',
        label: 'WhatsApp Share',
        param: 'ref=whatsapp',
        url: `${origin}?ref=whatsapp`,
        icon: '💬',
        description: 'Pentru mesaje pe WhatsApp trimise clienților și grupurilor',
      },
      {
        key: 'INSTAGRAM',
        label: 'Instagram Bio',
        param: 'ref=instagram',
        url: `${origin}?ref=instagram`,
        icon: '📸',
        description: 'Pentru link-ul din bio la profilul @gangstyle sau story-uri',
      },
      {
        key: 'PRIETEN',
        label: 'Recomandare Prieteni',
        param: 'ref=prieten',
        url: `${origin}?ref=prieten`,
        icon: '🤝',
        description: 'Link general de recomandare distribuit de clienți',
      },
    ];

    // Dynamically generate links for all active barbers in the salon
    const activeBarbers =
      barberList && barberList.length > 0
        ? barberList
        : [
            { name: 'Filip', slug: 'filip' },
            { name: 'Sebi', slug: 'sebi' },
          ];

    const barberLinks: ReferralLinkOption[] = activeBarbers.map((b) => ({
      key: `BARBER_${b.slug.toUpperCase()}`,
      label: `Recomandare ${b.name}`,
      param: `ref=${b.slug}`,
      url: `${origin}?ref=${b.slug}`,
      icon: b.slug === 'sebi' ? '✂️' : '💈',
      description: `Pentru clienții care vin direct prin recomandarea lui ${b.name}`,
    }));

    return [...baseLinks, ...barberLinks];
  }

  /**
   * Loads the stored referral object from browser localStorage.
   */
  private loadStoredReferral(): ActiveReferral {
    if (typeof window !== 'undefined' && window.localStorage) {
      try {
        const raw = window.localStorage.getItem(this.storageKey);
        if (raw) {
          return JSON.parse(raw) as ActiveReferral;
        }
      } catch {
        // Fall back to default on parse failure
      }
    }
    return {
      source: 'DIRECT_ORGANIC',
      label: 'Direct / Căutare Google',
      timestamp: Date.now(),
    };
  }

  /**
   * Persists the active referral attribution to localStorage and updates the reactive signal.
   */
  private saveReferral(ref: ActiveReferral): void {
    this.currentReferral.set(ref);
    if (typeof window !== 'undefined' && window.localStorage) {
      try {
        window.localStorage.setItem(this.storageKey, JSON.stringify(ref));
      } catch {
        // Ignored if storage quota exceeded or access denied
      }
    }
  }
}
