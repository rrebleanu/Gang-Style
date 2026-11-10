// A barber shown on the public pages (Home cards, direct link /:slug).
export interface Barber {
  id: string;
  slug: string; // used in the direct link, e.g. /filip
  name: string;
  bio: string; // one short sentence shown on the card
  photoUrl: string; // path inside /public, e.g. images/salon3.jpg
  specialties: string[];
  portfolio: string[]; // small preview images of their work
}
