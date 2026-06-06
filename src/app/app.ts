import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';

import { AppShellHeaderComponent } from './shell/app-shell-header.component';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [AppShellHeaderComponent, RouterOutlet],
  templateUrl: './app.html',
  styleUrl: './app.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class App {
}
