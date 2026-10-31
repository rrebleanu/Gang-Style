import { Component } from '@angular/core';
import { FooterComponent } from '../../shared/components/footer/footer.component';

@Component({
  selector: 'app-public',
  imports: [FooterComponent],
  templateUrl: './public.html',
  styleUrl: './public.scss',
})
export class Public {
  onBookClick() {
    alert('Sistemul de programări se deschide curând!');
  }
}
