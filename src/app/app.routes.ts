import { Routes } from '@angular/router';

import { EnergyBalancePageComponent } from './balans/energy-balance-page.component';
import { EnergyConsumptionPageComponent } from './verbruik/energy-consumption-page.component';
import { EnergyCostsPageComponent } from './grid-systeem/energy-costs-page.component';
import { EnergyGenerationPageComponent } from './opwek/energy-generation-page.component';
import { ExplanationPageComponent } from './uitleg/explanation-page.component';
import { HydrogenImportPageComponent } from './waterstof/hydrogen-import-page.component';

export const routes: Routes = [
	{ path: '', pathMatch: 'full', redirectTo: 'verbruik' },
	{ path: 'verbruik', component: EnergyConsumptionPageComponent },
	{ path: 'opwek', component: EnergyGenerationPageComponent },
	{ path: 'balans', component: EnergyBalancePageComponent },
	{ path: 'berekeningen', component: EnergyCostsPageComponent },
	{ path: 'waterstof-import', component: HydrogenImportPageComponent },
	{ path: 'uitleg', component: ExplanationPageComponent },
	{ path: 'netwerk', redirectTo: 'waterstof-import' },
	{ path: '**', redirectTo: 'verbruik' },
];
