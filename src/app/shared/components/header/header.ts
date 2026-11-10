import { Component, signal } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';

@Component({
  selector: 'app-header',
  standalone: true,
  imports: [RouterLink, RouterLinkActive],
  templateUrl: './header.html',
  styleUrl: './header.scss',
  host: {
    // close the mobile menu with the Escape key
    '(document:keydown.escape)': 'closeMenu()',
  },
})
export class HeaderComponent {
  // mobile menu state (only visible below 700px)
  readonly menuOpen = signal(false);

  toggleMenu(): void {
    this.menuOpen.update((open) => !open);
  }

  // called on every link click, so the menu closes after navigation
  closeMenu(): void {
    this.menuOpen.set(false);
  }

  // closes mobile menu and smoothly scrolls to the target section on the page
  scrollTo(sectionId: string): void {
    this.closeMenu();
    if (typeof document !== 'undefined') {
      setTimeout(() => {
        document.getElementById(sectionId)?.scrollIntoView({ behavior: 'smooth' });
      }, 50);
    }
  }
}
