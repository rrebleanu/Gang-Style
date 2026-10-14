import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';

import { HeaderComponent } from './shared/components/header/header';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, HeaderComponent],
  templateUrl: './app.html',
  styleUrl: './app.scss',
})
export class App {
  title = 'gang-style-frontend';

  // Funcția apelată la click pe buton
  onBookClick() {
    alert('Sistemul de programări se deschide curând!');
  }
}
