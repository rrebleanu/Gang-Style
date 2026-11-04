import { Component } from '@angular/core';

@Component({
  selector: 'app-public',
  imports: [],
  templateUrl: './public.html',
  styleUrl: './public.scss',
})
export class Public {
  onBookClick() {
    alert('Sistemul de programări se deschide curând!');
  }
}
