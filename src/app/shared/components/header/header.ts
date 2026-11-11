import { Component, inject, signal } from '@angular/core';
import { Router, RouterLink, RouterLinkActive } from '@angular/router';
import { AuthService } from '../../../core/services/auth.service';

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
  readonly authService = inject(AuthService);
  private readonly router = inject(Router);

  // mobile menu state (only visible below 700px)
  readonly menuOpen = signal(false);

  toggleMenu(): void {
    this.menuOpen.update((open) => !open);
  }

  // called on every link click, so the menu closes after navigation
  closeMenu(): void {
    this.menuOpen.set(false);
  }

  logout(): void {
    this.authService.logout();
    this.closeMenu();
    this.router.navigate(['/']);
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
