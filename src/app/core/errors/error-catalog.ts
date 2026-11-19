import { AppError, ErrorCategory, ErrorRoleContext } from './app-error.model';

/**
 * Standard HTTP Error descriptor containing default localized Romanian messages and suggestions.
 */
interface ErrorDescriptor {
  title: string;
  message: string;
  actionSuggestion?: string;
}

/**
 * Comprehensive mapping catalog of domain-specific and HTTP error messages
 * tailored for each role (Client, Barber, Admin, Auth, General) in the Gang Style ecosystem.
 */
export const ERROR_CATALOG = {
  /**
   * Network and infrastructure errors (applicable to all users).
   */
  NETWORK: {
    OFFLINE: {
      title: 'Conexiune Indisponibilă',
      message: 'Nu am putut comunica cu serverul. Te rugăm să verifici dacă ești conectat la internet.',
      actionSuggestion: 'Verifică conexiunea la internet sau reîncearcă în câteva secunde.',
    },
    TIMEOUT: {
      title: 'Timpul a Expirat',
      message: 'Serverul a răspuns prea greu. Cererea ta a fost anulată pentru siguranță.',
      actionSuggestion: 'Apasă reîmprospătare sau verifică dacă serverul rulează.',
    },
    SERVER_ERROR: {
      title: 'Eroare de Server (500)',
      message: 'A apărut o problemă tehnică neașteptată pe serverul frizeriei.',
      actionSuggestion: 'Echipa tehnică a fost notificată. Te rugăm să reîncerci în scurt timp.',
    },
    MAINTENANCE: {
      title: 'Server în Mentenanță (503)',
      message: 'Platforma Gang Style efectuează o actualizare de mentenanță.',
      actionSuggestion: 'Te rugăm să revii în câteva minute.',
    },
  },

  /**
   * Authentication and Session errors (Login, Register, 2FA, JWT expiration).
   */
  AUTH: {
    400: {
      title: 'Date Incomplete sau Invalide',
      message: 'Formatul adresei de email sau al parolei nu respectă cerințele minime.',
      actionSuggestion: 'Asigură-te că emailul este valid și parola conține cel puțin 6 caractere.',
    },
    401: {
      title: 'Autentificare Eșuată',
      message: 'Emailul sau parola introdusă este incorectă, ori codul 2FA este expirat.',
      actionSuggestion: 'Verifică dacă ai introdus datele corecte sau folosește opțiunea de resetare a parolei.',
    },
    403: {
      title: 'Cont Suspendat sau Restricționat',
      message: 'Accesul la acest cont a fost restricționat temporar de administrator.',
      actionSuggestion: 'Contactează recepția salonului la 0770426308 pentru lămuriri.',
    },
    409: {
      title: 'Cont Existent',
      message: 'Există deja un cont înregistrat cu această adresă de email.',
      actionSuggestion: 'Autentifică-te direct în cont sau folosește altă adresă de email.',
    },
    429: {
      title: 'Prea Multe Încercări de Conectare',
      message: 'Din motive de securitate împotriva atacurilor brute-force, încercările repetate au fost blocate.',
      actionSuggestion: 'Te rugăm să aștepți 5 minute înainte de a reîncerca conectarea.',
    },
  } as Record<number, ErrorDescriptor>,

  /**
   * Public Client Booking flow errors (Booking Wizard, Horizon, Conflicts, Blacklist).
   */
  BOOKING: {
    400: {
      title: 'Programare Invalidă',
      message: 'Data selectată depășește orizontul de 14 zile, este în trecut sau datele de contact sunt greșite.',
      actionSuggestion: 'Alege o zi din următoarele 14 zile calendaristice și verifică numărul de telefon.',
    },
    404: {
      title: 'Frizer sau Serviciu Indisponibil',
      message: 'Frizerul sau pachetul ales nu mai figurează în oferta activă a salonului.',
      actionSuggestion: 'Selectează un alt frizer sau alege un alt serviciu din listă.',
    },
    409: {
      title: 'Slot Ocupat între Timp',
      message: 'Intervalul orar pe care l-ai ales tocmai a fost rezervat de un alt client (Race Condition).',
      actionSuggestion: 'Te rugăm să selectezi un alt slot orar disponibil din calendar.',
    },
    429: {
      title: 'Limită de Rezervări Atinsă',
      message: 'Ai trimis mai multe solicitări de rezervare într-un timp foarte scurt.',
      actionSuggestion: 'Așteaptă un minut înainte de a trimite o nouă cerere.',
    },
    BLACKLISTED: {
      title: 'Rezervare Online Blocată',
      message: 'Din cauza a 2 sau mai multe neprezentări anterioare, rezervările online automate sunt restricționate.',
      actionSuggestion: 'Te rugăm să contactezi direct salonul la nr. 0770426308 pentru programare.',
    },
  } as Record<number | string, ErrorDescriptor>,

  /**
   * Client Portal errors (Viewing history, rescheduling, cancellation, Anti-IDOR).
   */
  PORTAL_CLIENT: {
    400: {
      title: 'Modificare Nepermisă',
      message: 'Nu poți reprograma în trecut și nu poți anula o programare care a trecut deja.',
      actionSuggestion: 'Alege o oră din viitor sau sună direct la salon dacă este o urgență.',
    },
    403: {
      title: 'Acces Respins (Anti-IDOR)',
      message: 'Nu ai permisiunea de a vizualiza, modifica sau anula programarea altui client.',
      actionSuggestion: 'Asigură-te că ești autentificat în contul tău personal.',
    },
    404: {
      title: 'Programare Negăsită',
      message: 'Programarea solicitată nu mai există în sistem sau a fost deja anulată.',
      actionSuggestion: 'Reîmprospătează lista de programări pentru a vedea starea actuală.',
    },
    409: {
      title: 'Interval Indisponibil la Reprogramare',
      message: 'Noul interval selectat pentru reprogramare se suprapune cu o altă programare.',
      actionSuggestion: 'Alege o altă oră liberă din programul frizerului tău.',
    },
  } as Record<number, ErrorDescriptor>,

  /**
   * Barber Portal errors (Schedule management, status transitions, personal blocks).
   */
  PORTAL_BARBER: {
    400: {
      title: 'Operațiune Invalidă pentru Frizer',
      message: 'Tranziția de status este invalidă (de exemplu, nu poți marca drept finalizată o programare viitoare).',
      actionSuggestion: 'Verifică data și ora programării înainte de a actualiza statusul.',
    },
    403: {
      title: 'Acces Restricționat Frizer',
      message: 'Nu poți modifica programările sau pauzele altui coleg frizer.',
      actionSuggestion: 'Comută pe propriul tău profil de frizer din colțul din dreapta sus.',
    },
    404: {
      title: 'Înregistrare Negăsită',
      message: 'Programarea sau pauza selectată nu a fost găsită în baza de date.',
      actionSuggestion: 'Reîmprospătează agenda zilei.',
    },
    409: {
      title: 'Conflict cu Programări Active',
      message: 'Nu poți bloca această zi sau interval deoarece există deja clienți programați.',
      actionSuggestion: 'Reprogramează sau anulează mai întâi programările clienților afectați.',
    },
  } as Record<number, ErrorDescriptor>,

  /**
   * Admin Portal errors (Service catalog CRUD, barber assignments, global settings).
   */
  PORTAL_ADMIN: {
    400: {
      title: 'Date Administrative Invalide',
      message: 'Prețul sau durata serviciului trebuie să fie numere pozitive mai mari decât 0.',
      actionSuggestion: 'Verifică formularul și completează toate câmpurile obligatorii.',
    },
    403: {
      title: 'Permisiuni Insuficiente',
      message: 'Această acțiune este rezervată exclusiv utilizatorilor cu rol de Administrator.',
      actionSuggestion: 'Autentifică-te cu contul de administrator Gang Style.',
    },
    404: {
      title: 'Element Administrativ Negăsit',
      message: 'Serviciul, frizerul sau entitatea căutată a fost ștearsă sau nu există.',
      actionSuggestion: 'Reîmprospătează lista pentru a sincroniza datele cu serverul.',
    },
    409: {
      title: 'Conflict de Date Administrative',
      message: 'Există deja un element cu același identificator sau o suprapunere în orar.',
      actionSuggestion: 'Verifică datele existente pentru a evita duplicatele.',
    },
  } as Record<number, ErrorDescriptor>,
};

/**
 * Resolves the appropriate ErrorCategory based on the provided role context.
 */
export function resolveCategoryForContext(context: ErrorRoleContext): ErrorCategory {
  switch (context) {
    case 'AUTH':
      return 'AUTH';
    case 'CLIENT':
      return 'PORTAL_CLIENT';
    case 'BARBER':
      return 'PORTAL_BARBER';
    case 'ADMIN':
      return 'PORTAL_ADMIN';
    default:
      return 'GENERAL';
  }
}
