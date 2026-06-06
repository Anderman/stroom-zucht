import { Injectable } from '@angular/core';

export type BalanceModel = {
  // Totale opwek per uur (publiek + privé)
  adjustedGenerationValues: number[];
  // Publiek opwek per uur (wind + publicSolar + nuclear + afval/biogas)
  adjustedPublicGenerationValues: number[];
  // Privé zon per uur
  adjustedPrivateGenerationValues: number[];
  // Ruwe balans (voor batterij)
  rawBalanceValues: number[];
  // Restbalans (na batterij, negatief = tekort)
  residualBalanceValues: number[];
  // Gecombineerde batterij SoC (backward compat voor grafieken)
  batteryStateValues: number[];
  // Afzonderlijke batterij SoC
  publicBatteryStateValues: number[];
  privateBatteryStateValues: number[];
  // Curtailment (alleen als BEIDE batterijen vol)
  publicCurtailmentBeforeHydrogenValues: number[];
  publicCurtailmentValues: number[];
  privateCurtailmentValues: number[];
  publicWindlandCurtailmentValues: number[];
  publicWindzeeCurtailmentValues: number[];
  publicSolarCurtailmentValues: number[];
  publicNuclearCurtailmentValues: number[];
  publicAfvalBiogasCurtailmentValues: number[];
  // Uurlijkse inzet van overschot naar waterstoffabrieken
  hydrogenToFactoriesValues: number[];
  // Energiestromen tussen publiek en privé
  privateSolarToPublicValues: number[]; // privé zon → publieke batterij
  publicToPrivateValues: number[];      // publiek overschot → privébatterij
  // Privé vraag die door eigen opwek/batterij wordt afgedekt
  privateSelfServedValues: number[];
};

type BuildBalanceModelInput = {
  privateSolarValues: number[];
  publicSolarValues: number[];
  windlandValues: number[];
  windzeeValues: number[];
  nuclearValues: number[];
  afvalBiogasValues: number[];
  demandValues: number[];
  publicBatteryCapacityGWh: number;
  privateBatteryCapacityGWh: number;
  /** Max laadvermogen publieke batterij in GW. 0 = onbeperkt. */
  publicBatteryChargePowerGW: number;
  /** Aandeel van de vraag dat als private vraag wordt behandeld (0-1). */
  privateDemandShare: number;
  /** Max gecombineerde private afname via publiek net (vraag + publiek->privé laden) in GW. 0 = onbeperkt. */
  privateGridMaxLoadGW: number;
  /** Jaarlijks doel voor waterstofproductie uit overschot in TWh. */
  hydrogenProductionTargetTWh: number;
  /** Elektrolysercapaciteit voor waterstofrouting in GW. 0 = geen routing naar waterstof. */
  hydrogenElectrolyzerCapacityGW: number;
  /** Optionele timestamps (ms). Indien leeg wordt maand afgeleid vanuit uur-index vanaf 1 jan. */
  timestamps?: number[];
};

type SimulationResult = {
  rawBalanceValues: number[];
  residualBalanceValues: number[];
  publicBatteryStateValues: number[];
  privateBatteryStateValues: number[];
  publicCurtailmentBeforeHydrogenValues: number[];
  publicCurtailmentValues: number[];
  privateCurtailmentValues: number[];
  publicWindlandCurtailmentValues: number[];
  publicWindzeeCurtailmentValues: number[];
  publicSolarCurtailmentValues: number[];
  publicNuclearCurtailmentValues: number[];
  publicAfvalBiogasCurtailmentValues: number[];
  hydrogenToFactoriesValues: number[];
  privateSolarToPublicValues: number[];
  publicToPrivateValues: number[];
  privateSelfServedValues: number[];
  finalPublicStoredEnergy: number;
  finalPrivateStoredEnergy: number;
};

@Injectable({ providedIn: 'root' })
export class BalanceModelService {
  private static readonly PRIVATE_EXPORT_LOOKAHEAD_HOURS = 24;
  private static readonly NUCLEAR_MIN_OUTPUT_SHARE = 0.5;
  private static readonly WINTER_PRIVATE_RESERVE_SHARE = 0.5;
  private static readonly SUMMER_PRIVATE_RESERVE_SHARE = 0.2;
  private static readonly PV_TO_HYDROGEN_MAX_GW = 35;
  private static readonly AMSTERDAM_MONTH_FORMATTER = new Intl.DateTimeFormat('en-US', {
    month: 'numeric',
    timeZone: 'Europe/Amsterdam',
  });

  buildModel(input: BuildBalanceModelInput): BalanceModel {
    const adjustedPublicGenerationValues = input.publicSolarValues.map((value, index) =>
      value
      + (input.windlandValues[index] ?? 0)
      + (input.windzeeValues[index] ?? 0)
      + (input.nuclearValues[index] ?? 0)
      + (input.afvalBiogasValues[index] ?? 0),
    );
    const adjustedPrivateGenerationValues = input.privateSolarValues.slice();
    const adjustedGenerationValues = adjustedPublicGenerationValues.map((value, index) =>
      value + (adjustedPrivateGenerationValues[index] ?? 0),
    );

    const publicBatteryCapacity = input.publicBatteryCapacityGWh * 1_000_000;
    const privateBatteryCapacity = input.privateBatteryCapacityGWh * 1_000_000;
    const pubChargeMaxKWh = input.publicBatteryChargePowerGW > 0 ? input.publicBatteryChargePowerGW * 1_000_000 : Infinity;
    const privGridMaxKWh = input.privateGridMaxLoadGW > 0 ? input.privateGridMaxLoadGW * 1_000_000 : Infinity;

    // Convergentie: vind stabiele beginstatus voor beide batterijen
    let initialPublic = publicBatteryCapacity / 2;
    let initialPrivate = privateBatteryCapacity / 2;
    let simulation = this.simulateYear(
      input.publicSolarValues,
      input.windlandValues,
      input.windzeeValues,
      input.nuclearValues,
      input.afvalBiogasValues,
      adjustedPrivateGenerationValues,
      input.demandValues,
      publicBatteryCapacity, privateBatteryCapacity, initialPublic, initialPrivate, pubChargeMaxKWh, privGridMaxKWh, input.privateDemandShare, input.hydrogenProductionTargetTWh, input.timestamps,
      input.hydrogenElectrolyzerCapacityGW,
    );

    for (let iteration = 0; iteration < 5; iteration += 1) {
      const nextPublic = simulation.finalPublicStoredEnergy;
      const nextPrivate = simulation.finalPrivateStoredEnergy;
      if (Math.abs(nextPublic - initialPublic) <= 1 && Math.abs(nextPrivate - initialPrivate) <= 1) {
        break;
      }
      initialPublic = nextPublic;
      initialPrivate = nextPrivate;
      simulation = this.simulateYear(
        input.publicSolarValues,
        input.windlandValues,
        input.windzeeValues,
        input.nuclearValues,
        input.afvalBiogasValues,
        adjustedPrivateGenerationValues,
        input.demandValues,
        publicBatteryCapacity, privateBatteryCapacity, initialPublic, initialPrivate, pubChargeMaxKWh, privGridMaxKWh, input.privateDemandShare, input.hydrogenProductionTargetTWh, input.timestamps,
        input.hydrogenElectrolyzerCapacityGW,
      );
    }

    const combinedBatteryState = simulation.publicBatteryStateValues.map((v, i) =>
      v + (simulation.privateBatteryStateValues[i] ?? 0),
    );

    return {
      adjustedGenerationValues,
      adjustedPublicGenerationValues,
      adjustedPrivateGenerationValues,
      rawBalanceValues: simulation.rawBalanceValues,
      residualBalanceValues: simulation.residualBalanceValues,
      batteryStateValues: combinedBatteryState,
      publicBatteryStateValues: simulation.publicBatteryStateValues,
      privateBatteryStateValues: simulation.privateBatteryStateValues,
      publicCurtailmentBeforeHydrogenValues: simulation.publicCurtailmentBeforeHydrogenValues,
      publicCurtailmentValues: simulation.publicCurtailmentValues,
      privateCurtailmentValues: simulation.privateCurtailmentValues,
      publicWindlandCurtailmentValues: simulation.publicWindlandCurtailmentValues,
      publicWindzeeCurtailmentValues: simulation.publicWindzeeCurtailmentValues,
      publicSolarCurtailmentValues: simulation.publicSolarCurtailmentValues,
      publicNuclearCurtailmentValues: simulation.publicNuclearCurtailmentValues,
      publicAfvalBiogasCurtailmentValues: simulation.publicAfvalBiogasCurtailmentValues,
      hydrogenToFactoriesValues: simulation.hydrogenToFactoriesValues,
      privateSolarToPublicValues: simulation.privateSolarToPublicValues,
      publicToPrivateValues: simulation.publicToPrivateValues,
      privateSelfServedValues: simulation.privateSelfServedValues,
    };
  }

  private simulateYear(
    publicSolarValues: number[],
    windlandValues: number[],
    windzeeValues: number[],
    nuclearValues: number[],
    afvalBiogasValues: number[],
    privateGenValues: number[],
    demandValues: number[],
    pubCap: number,
    privCap: number,
    initialPubSoC: number,
    initialPrivSoC: number,
    pubChargeMaxKWh: number,
    privGridMaxKWh: number,
    privateDemandShare: number,
    hydrogenProductionTargetTWh: number,
    timestamps?: number[],
    hydrogenElectrolyzerCapacityGW = 0,
  ): SimulationResult {
    let pubSoC = Math.max(0, Math.min(initialPubSoC, pubCap));
    let privSoC = Math.max(0, Math.min(initialPrivSoC, privCap));

    const rawBalanceValues: number[] = [];
    const residualBalanceValues: number[] = [];
    const publicBatteryStateValues: number[] = [];
    const privateBatteryStateValues: number[] = [];
    const publicCurtailmentBeforeHydrogenValues: number[] = [];
    const publicCurtailmentValues: number[] = [];
    const privateCurtailmentValues: number[] = [];
    const publicWindlandCurtailmentValues: number[] = [];
    const publicWindzeeCurtailmentValues: number[] = [];
    const publicSolarCurtailmentValues: number[] = [];
    const publicNuclearCurtailmentValues: number[] = [];
    const publicAfvalBiogasCurtailmentValues: number[] = [];
    const hydrogenToFactoriesValues: number[] = [];
    const privateSolarToPublicValues: number[] = [];
    const publicToPrivateValues: number[] = [];
    const privateSelfServedValues: number[] = [];
    const hydrogenElectrolyzerCapacityKWh = hydrogenElectrolyzerCapacityGW > 0 ? hydrogenElectrolyzerCapacityGW * 1_000_000 : 0;
    const hydrogenRoutingEnabled = hydrogenProductionTargetTWh > 0 && hydrogenElectrolyzerCapacityKWh > 0;

    const n = demandValues.length;
    for (let h = 0; h < n; h += 1) {
      const publicSolar = publicSolarValues[h] ?? 0;
      const windland = windlandValues[h] ?? 0;
      const windzee = windzeeValues[h] ?? 0;
      const nuclear = nuclearValues[h] ?? 0;
      const afvalBiogas = afvalBiogasValues[h] ?? 0;
      const publicGen = publicSolar + windland + windzee + nuclear + afvalBiogas;
      const privateGen = privateGenValues[h] ?? 0;
      const demand = demandValues[h] ?? 0;
      const privateDemand = demand * privateDemandShare;
      const publicDemand = demand - privateDemand;
      const totalGen = publicGen + privateGen;
      const rawBalance = totalGen - demand;
      rawBalanceValues.push(rawBalance);

      let pubCurtailment = 0;
      let privCurtailment = 0;
      let privToPublicFlow = 0;
      let pubToPrivateFlow = 0;
      let curtailWindland = 0;
      let curtailWindzee = 0;
      let curtailPublicSolar = 0;
      let curtailNuclear = 0;
      let curtailAfvalBiogas = 0;
      let hydrogenToFactories = 0;

      const privateReserveTarget = this.getPrivateReserveTarget(h, privCap, timestamps, n);
      let privateGridHeadroom = privGridMaxKWh;

      // Private gebruikt eerst eigen opwek voor eigen vraag.
      let privateDemandRemaining = Math.max(0, privateDemand - privateGen);
      let privateSurplus = Math.max(0, privateGen - privateDemand);

      // Daarna ontlaadt private batterij alleen boven het seizoensminimum.
      const privateDischargeAvailable = Math.max(0, privSoC - privateReserveTarget);
      const privateDischarge = Math.min(privateDemandRemaining, privateDischargeAvailable);
      privSoC -= privateDischarge;
      privateDemandRemaining -= privateDischarge;

      // Overblijvend private tekort wordt import uit publiek, begrensd door private netcap.
      const privateImportFromPublic = Math.min(privateDemandRemaining, privateGridHeadroom);
      privateGridHeadroom -= privateImportFromPublic;
      privateDemandRemaining -= privateImportFromPublic;

      // Noodfallback: bij system shortage mag reserve worden aangesproken voor private vraag.
      if (privateDemandRemaining > 0) {
        const emergencyPrivateDischarge = Math.min(privateDemandRemaining, privSoC);
        privSoC -= emergencyPrivateDischarge;
        privateDemandRemaining -= emergencyPrivateDischarge;
      }

      const privateSelfServed = Math.max(0, privateDemand - privateDemandRemaining - privateImportFromPublic);

      // Private surplus: eerst private batterij, resterend kan direct naar publiek.
      const privChargePriv = Math.min(privateSurplus, privCap - privSoC);
      privSoC += privChargePriv;
      privateSurplus -= privChargePriv;

      // 24u-vooruitkijk: verkoop alleen wat we met zekerheid missen binnen de horizon.
      const privateExportReserve = privCap > 0
        ? this.forecastPrivateExportReserve(
          h,
          privateGenValues,
          demandValues,
          privateDemandShare,
        )
        : 0;
      const privateExportAllowedByReserve = Math.max(0, privSoC + privateSurplus - privateExportReserve);
      const privateExportPotential = Math.min(privateSurplus, privateExportAllowedByReserve);
      const privateUnsoldSurplus = Math.max(0, privateSurplus - privateExportPotential);

      const publicDemandTotal = publicDemand + privateImportFromPublic;

      // Publiek dekt eigen vraag plus private importvraag, met publieke opwek + private export.
      const publicSupplyAvailable = publicGen + privateExportPotential;
      const publicNet = publicSupplyAvailable - publicDemandTotal;

      if (publicNet >= 0) {
        const pubChargePub = Math.min(publicNet, pubCap - pubSoC, pubChargeMaxKWh);
        pubSoC += pubChargePub;
        let surplusAfterStorage = publicNet - pubChargePub;

        // Publiek overschot kan private batterij bijvullen tot reserve (niet per se vol), binnen private netheadroom.
        const reserveGap = Math.max(0, privateReserveTarget - privSoC);
        pubToPrivateFlow = Math.min(surplusAfterStorage, reserveGap, privateGridHeadroom);
        if (pubToPrivateFlow > 0) {
          privSoC += pubToPrivateFlow;
          privateGridHeadroom -= pubToPrivateFlow;
          surplusAfterStorage -= pubToPrivateFlow;
        }

        const publicCurtailmentResult = this.applyPublicCurtailmentPriority(surplusAfterStorage, {
          windland,
          windzee,
          publicSolar,
          nuclear,
          afvalBiogas,
        });

        curtailWindland = publicCurtailmentResult.curtailWindland;
        curtailWindzee = publicCurtailmentResult.curtailWindzee;
        curtailPublicSolar = publicCurtailmentResult.curtailPublicSolar;
        curtailNuclear = publicCurtailmentResult.curtailNuclear;
        curtailAfvalBiogas = publicCurtailmentResult.curtailAfvalBiogas;
        let remainingSurplus = publicCurtailmentResult.remainingSurplus;

        let privateExportCurtailment = Math.min(privateExportPotential, remainingSurplus);
        remainingSurplus -= privateExportCurtailment;
        let privateUnsoldCurtailment = privateUnsoldSurplus;

        const publicCurtailmentBeforeHydrogen =
          curtailWindland + curtailWindzee + curtailPublicSolar + curtailNuclear + curtailAfvalBiogas + Math.max(0, remainingSurplus);

        if (hydrogenRoutingEnabled) {
          const hydrogenRouting = this.routeCurtailmentToHydrogen({
            curtailWindland,
            curtailWindzee,
            curtailPublicSolar,
            curtailNuclear,
            curtailAfvalBiogas,
            privateUnsoldCurtailment,
            privateExportCurtailment,
            remainingSurplus,
            maxHydrogenInputKWh: hydrogenElectrolyzerCapacityKWh,
          });

          curtailWindland = hydrogenRouting.curtailWindland;
          curtailWindzee = hydrogenRouting.curtailWindzee;
          curtailPublicSolar = hydrogenRouting.curtailPublicSolar;
          curtailNuclear = hydrogenRouting.curtailNuclear;
          curtailAfvalBiogas = hydrogenRouting.curtailAfvalBiogas;
          privateUnsoldCurtailment = hydrogenRouting.privateUnsoldCurtailment;
          privateExportCurtailment = hydrogenRouting.privateExportCurtailment;
          remainingSurplus = hydrogenRouting.remainingSurplus;
          hydrogenToFactories = hydrogenRouting.totalToHydrogen;
        }

        privToPublicFlow = Math.max(0, privateExportPotential - privateExportCurtailment);

        // Onoplosbaar restsurplus telt als publiek restoverschot (must-run publieke bronnen).
        pubCurtailment = curtailWindland + curtailWindzee + curtailPublicSolar + curtailNuclear + curtailAfvalBiogas + Math.max(0, remainingSurplus);
        privCurtailment = privateUnsoldCurtailment + privateExportCurtailment;
        residualBalanceValues.push(pubCurtailment + privCurtailment);
        publicCurtailmentBeforeHydrogenValues.push(publicCurtailmentBeforeHydrogen);
      } else {
        const publicDeficit = -publicNet;
        const privEmergencyToPublic = Math.min(publicDeficit, privSoC);
        privSoC -= privEmergencyToPublic;

        const deficitAfterPrivate = publicDeficit - privEmergencyToPublic;
        const pubDischarge = Math.min(deficitAfterPrivate, pubSoC);
        pubSoC -= pubDischarge;
        const shortfall = deficitAfterPrivate - pubDischarge;

        // Bij systeemtekort mag private reserve alsnog worden gebruikt voor resterende private vraag.
        if (privateDemandRemaining > 0 && shortfall > 0) {
          const emergencyPrivateDischarge = Math.min(privateDemandRemaining, privSoC);
          privSoC -= emergencyPrivateDischarge;
          privateDemandRemaining -= emergencyPrivateDischarge;
        }

        privCurtailment = privateUnsoldSurplus;
        privToPublicFlow = privateExportPotential + privEmergencyToPublic;
        residualBalanceValues.push(-(shortfall + privateDemandRemaining));
        publicCurtailmentBeforeHydrogenValues.push(0);
      }

      publicBatteryStateValues.push(pubSoC);
      privateBatteryStateValues.push(privSoC);
      publicCurtailmentValues.push(pubCurtailment);
      privateCurtailmentValues.push(privCurtailment);
      publicWindlandCurtailmentValues.push(curtailWindland);
      publicWindzeeCurtailmentValues.push(curtailWindzee);
      publicSolarCurtailmentValues.push(curtailPublicSolar);
      publicNuclearCurtailmentValues.push(curtailNuclear);
      publicAfvalBiogasCurtailmentValues.push(curtailAfvalBiogas);
      hydrogenToFactoriesValues.push(hydrogenToFactories);
      privateSolarToPublicValues.push(privToPublicFlow);
      publicToPrivateValues.push(pubToPrivateFlow);
      privateSelfServedValues.push(privateSelfServed);
    }

    return {
      rawBalanceValues,
      residualBalanceValues,
      publicBatteryStateValues,
      privateBatteryStateValues,
      publicCurtailmentBeforeHydrogenValues,
      publicCurtailmentValues,
      privateCurtailmentValues,
      publicWindlandCurtailmentValues,
      publicWindzeeCurtailmentValues,
      publicSolarCurtailmentValues,
      publicNuclearCurtailmentValues,
      publicAfvalBiogasCurtailmentValues,
      hydrogenToFactoriesValues,
      privateSolarToPublicValues,
      publicToPrivateValues,
      privateSelfServedValues,
      finalPublicStoredEnergy: pubSoC,
      finalPrivateStoredEnergy: privSoC,
    };
  }

  private getPrivateReserveTarget(hourIndex: number, privateCapacity: number, timestamps: number[] | undefined, totalHours: number): number {
    if (privateCapacity <= 0) {
      return 0;
    }

    const month = this.resolveMonth(hourIndex, timestamps, totalHours);
    const reserveShare = this.getSeasonalReserveShare(month);
    return privateCapacity * reserveShare;
  }

  private resolveMonth(hourIndex: number, timestamps: number[] | undefined, totalHours: number): number {
    const timestamp = timestamps?.[hourIndex];
    if (typeof timestamp === 'number' && Number.isFinite(timestamp)) {
      const monthText = BalanceModelService.AMSTERDAM_MONTH_FORMATTER.format(timestamp);
      const month = Number.parseInt(monthText, 10);
      if (Number.isFinite(month) && month >= 1 && month <= 12) {
        return month;
      }
    }

    // Fallback zonder timestamps: veronderstel reeks die start op 1 januari.
    const inferredYear = totalHours >= 8784 ? 2024 : 2025;
    return new Date(Date.UTC(inferredYear, 0, 1, hourIndex)).getUTCMonth() + 1;
  }

  private getSeasonalReserveShare(month: number): number {
    const isWinterMonth = month >= 10 || month <= 2;
    return isWinterMonth
      ? BalanceModelService.WINTER_PRIVATE_RESERVE_SHARE
      : BalanceModelService.SUMMER_PRIVATE_RESERVE_SHARE;
  }

  private applyPublicCurtailmentPriority(
    surplusToReduce: number,
    generation: {
      windland: number;
      windzee: number;
      publicSolar: number;
      nuclear: number;
      afvalBiogas: number;
    },
  ): {
    publicCurtailment: number;
    remainingSurplus: number;
    curtailWindland: number;
    curtailWindzee: number;
    curtailPublicSolar: number;
    curtailNuclear: number;
    curtailAfvalBiogas: number;
  } {
    let remaining = Math.max(0, surplusToReduce);
    let curtailed = 0;

    const curtailWindland = Math.min(generation.windland, remaining);
    curtailed += curtailWindland;
    remaining -= curtailWindland;

    const curtailWindzee = Math.min(generation.windzee, remaining);
    curtailed += curtailWindzee;
    remaining -= curtailWindzee;

    const curtailPublicSolar = Math.min(generation.publicSolar, remaining);
    curtailed += curtailPublicSolar;
    remaining -= curtailPublicSolar;

    const nuclearMinOutput = generation.nuclear * BalanceModelService.NUCLEAR_MIN_OUTPUT_SHARE;
    const nuclearReducible = Math.max(0, generation.nuclear - nuclearMinOutput);
    const curtailNuclear = Math.min(nuclearReducible, remaining);
    curtailed += curtailNuclear;
    remaining -= curtailNuclear;

    // Als het nog steeds moet, wordt ook must-run basislast afgeregeld.
    const curtailAfvalBiogas = Math.min(generation.afvalBiogas, remaining);
    curtailed += curtailAfvalBiogas;
    remaining -= curtailAfvalBiogas;

    return {
      publicCurtailment: curtailed,
      remainingSurplus: Math.max(0, remaining),
      curtailWindland,
      curtailWindzee,
      curtailPublicSolar,
      curtailNuclear,
      curtailAfvalBiogas,
    };
  }

  private forecastPrivateExportReserve(
    hourIndex: number,
    privateGenValues: number[],
    demandValues: number[],
    privateDemandShare: number,
  ): number {
    let cumulativeNet = 0;
    let minCumulativeNet = 0;
    const horizonEnd = Math.min(privateGenValues.length, hourIndex + BalanceModelService.PRIVATE_EXPORT_LOOKAHEAD_HOURS + 1);

    for (let futureIndex = hourIndex + 1; futureIndex < horizonEnd; futureIndex += 1) {
      const futurePrivateGen = privateGenValues[futureIndex] ?? 0;
      const futureDemand = demandValues[futureIndex] ?? 0;
      const futurePrivateDemand = futureDemand * privateDemandShare;
      cumulativeNet += futurePrivateGen - futurePrivateDemand;
      minCumulativeNet = Math.min(minCumulativeNet, cumulativeNet);
    }

    return Math.max(0, -minCumulativeNet);
  }

  private routeCurtailmentToHydrogen(input: {
    curtailWindland: number;
    curtailWindzee: number;
    curtailPublicSolar: number;
    curtailNuclear: number;
    curtailAfvalBiogas: number;
    privateUnsoldCurtailment: number;
    privateExportCurtailment: number;
    remainingSurplus: number;
    maxHydrogenInputKWh: number;
  }): {
    totalToHydrogen: number;
    curtailWindland: number;
    curtailWindzee: number;
    curtailPublicSolar: number;
    curtailNuclear: number;
    curtailAfvalBiogas: number;
    privateUnsoldCurtailment: number;
    privateExportCurtailment: number;
    remainingSurplus: number;
  } {
    let hydrogenCapRemaining = Math.max(0, input.maxHydrogenInputKWh);
    const pvCapKWh = BalanceModelService.PV_TO_HYDROGEN_MAX_GW * 1_000_000;
    let pvCapRemaining = pvCapKWh;

    const takeHydrogenInput = (amount: number): number => {
      const taken = Math.min(Math.max(0, amount), hydrogenCapRemaining);
      hydrogenCapRemaining -= taken;
      return taken;
    };

    const takeHydrogenPvInput = (amount: number): number => {
      const taken = Math.min(Math.max(0, amount), pvCapRemaining, hydrogenCapRemaining);
      pvCapRemaining -= taken;
      hydrogenCapRemaining -= taken;
      return taken;
    };

    // Prioriteit: niet-PV overschotten eerst, daarna PV-stromen binnen PV-cap.
    const windlandToHydrogen = takeHydrogenInput(input.curtailWindland);
    const windzeeToHydrogen = takeHydrogenInput(input.curtailWindzee);
    const nuclearToHydrogen = takeHydrogenInput(input.curtailNuclear);
    const afvalBiogasToHydrogen = takeHydrogenInput(input.curtailAfvalBiogas);
    const remainingSurplusToHydrogen = takeHydrogenInput(input.remainingSurplus);

    const publicPvToHydrogen = takeHydrogenPvInput(input.curtailPublicSolar);
    const privateUnsoldToHydrogen = takeHydrogenPvInput(input.privateUnsoldCurtailment);
    const privateExportCurtailmentToHydrogen = takeHydrogenPvInput(input.privateExportCurtailment);

    const totalToHydrogen =
      publicPvToHydrogen
      + privateUnsoldToHydrogen
      + privateExportCurtailmentToHydrogen
      + windlandToHydrogen
      + windzeeToHydrogen
      + nuclearToHydrogen
      + afvalBiogasToHydrogen
      + remainingSurplusToHydrogen;

    return {
      totalToHydrogen,
      curtailWindland: input.curtailWindland - windlandToHydrogen,
      curtailWindzee: input.curtailWindzee - windzeeToHydrogen,
      curtailPublicSolar: input.curtailPublicSolar - publicPvToHydrogen,
      curtailNuclear: input.curtailNuclear - nuclearToHydrogen,
      curtailAfvalBiogas: input.curtailAfvalBiogas - afvalBiogasToHydrogen,
      privateUnsoldCurtailment: input.privateUnsoldCurtailment - privateUnsoldToHydrogen,
      privateExportCurtailment: input.privateExportCurtailment - privateExportCurtailmentToHydrogen,
      remainingSurplus: input.remainingSurplus - remainingSurplusToHydrogen,
    };
  }
}
