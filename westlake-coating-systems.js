(() => {
  "use strict";

  const SOURCE = Object.freeze({
    title: "PDES-8001 — Paint and Protective Coatings",
    revision: "7",
    date: "04/16/2008",
    facility: "Westlake Plaquemine",
    revisionNote: "Cover identifies Revision 7 dated 04/16/2008; internal document page headers display Rev. 6. Appendix G identifies Rev. 4-7, 4/2008. Preserve this discrepancy when citing the source."
  });

  const SP56_WARNING = "SPECIFICATION DISCREPANCY — the individual system page states white metal blast per SSPC-SP6, while Appendix F defines SSPC-SP5 as White Metal Blast Cleaning and SSPC-SP6 as Commercial Blast Cleaning. Verify the controlled requirement before acceptance.";

  const SYSTEMS = [
    ["G-1", "Wood, plywood and sheetrock; interior/exterior", "Solvent or soluble-detergent cleaning; remove dirt, loose caulk and residues; caulk defects; prime bare exterior wood; test WFT.", "Acrylic primer/topcoat. Source synopsis: primer 1-2 mil DFT; topcoat 1-3 mil DFT.", {
      pages: "14-15", service: "SSPC Zone 1A interior / 1B exterior; continuous temperature resistance shown as 150°F.",
      manufacturers: [
        ["Ameron", "148", "—", "220", "Primer 1-2 mil; finish 1-3 mil per synopsis"],
        ["Carboline", "3350", "—", "3359", "Use source/PDS for product-specific limits"],
        ["International", "Intercryl 510", "—", "Intercryl 520WB", "Use source/PDS for product-specific limits"],
        ["Sherwin-Williams", "—", "—", "A-100 Gloss Latex", "Use source/PDS for product-specific limits"]
      ]
    }],
    ["G-2A", "Concrete block structures, interior and exterior", "SSPC-SP1; muriatic-acid etch (1 part acid : 2 parts water); clean-water wash; neutralize if pH below 7; repeat wash; dry 48 hours; test WFT.", "Block filler plus acrylic finish. Filler 10-20 mil DFT; finish 1.5-2.5 mil DFT.", {
      pages: "16-17", service: "SSPC Zones 1A and 1B.",
      manufacturers: [
        ["Ameron", "Amerlock 400 BF", "—", "220", "Filler 10-20 mil; finish 1.5-2.5 mil per synopsis"],
        ["Carboline", "Flexide Block Filler", "—", "3359", "Use source/PDS for product-specific limits"],
        ["DuPont", "300P Block", "—", "N/A", "Finish listed N/A in source table"],
        ["International", "Intercryl 320", "—", "Intercryl 520WB", "Use source/PDS for product-specific limits"],
        ["Sherwin-Williams", "Heavy Duty Block", "—", "A-100 Gloss Latex", "Use source/PDS for product-specific limits"]
      ]
    }],
    ["G-2C", "Asphalt/concrete pavement and concrete floor striping", "Remove oil, grease and wax; remove loosely adhered deposits; brush blast to a sound substrate; remove loose dirt/dust; test WFT.", "Topcoat only; generic coating type not specified. Colors include Safety Yellow, Red, and other specified colors.", {
      pages: "18-19", service: "Pavement and floor striping; temperature resistance shown as 150°F.",
      manufacturers: [
        ["Ameron", "—", "—", "Amerlock 400", "Source product table; verify DFT from PDS"],
        ["Carboline", "—", "—", "Subsil 30", "Source product table; verify DFT from PDS"],
        ["DuPont", "—", "—", "Dulux 96", "Source product table; verify DFT from PDS"],
        ["International", "—", "—", "Intergard 740", "Source product table; verify DFT from PDS"],
        ["Sherwin-Williams", "—", "—", "Pro Martraffic", "Source product table; verify DFT from PDS"]
      ],
      notes: ["The system synopsis does not clearly assign a generic DFT value; verify the controlled product data sheet."]
    }],
    ["G-3A", "New/existing sheet-steel structures and metal buildings; vendor/fabricator painted sheet steel", "SSPC-SP1; mildew treatment as specified; clean-water wash; replace fasteners as required; remove loose residues; SSPC-SP2/SP3; caulk seams; remove dust; test WFT/DFT.", "Acrylic primer and acrylic finish. Source synopsis shows 4 mil WFT / 3 mil DFT without a clear coat-by-coat allocation.", {
      pages: "20-21", service: "Sheet-steel structures / metal buildings; 150°F shown in synopsis.",
      manufacturers: [
        ["Ameron", "148", "—", "220", "Use source/PDS for coat-specific DFT"],
        ["Carboline", "3358", "—", "339", "Use source/PDS for coat-specific DFT"],
        ["DuPont", "N/A", "—", "N/A", "Listed N/A"],
        ["International", "Intercryl 510", "—", "Intercryl 520WB", "Use source/PDS for coat-specific DFT"],
        ["Sherwin-Williams", "DTM Bonding", "—", "DTM Acrylic", "Use source/PDS for coat-specific DFT"]
      ]
    }],
    ["G-3B", "Sheet-steel buildings; safety/fire equipment; outdoor electrical equipment excluding motors", "SSPC-SP1; sheet steel also uses SP2/SP3 as applicable. Electrical/safety/fire equipment may use power wash, SP2, SP3, brush blast, SP6 or SP10; test WFT/DFT.", "Epoxy primer plus urethane finish; source synopsis lists 5 mil WFT / 2 mil DFT.", {
      pages: "22-23", service: "SSPC Zones 3B through 3E; 150°F shown in synopsis.",
      manufacturers: [
        ["Ameron", "385 PA", "—", "450H", "Source product combination"],
        ["Carboline", "890", "—", "134 HS", "Source product combination"],
        ["DuPont", "25P", "—", "326 Imron", "Source product combination"],
        ["International", "Interseal 385", "—", "Interthane 990", "Source product combination"],
        ["Sherwin-Williams", "Catalyzed Epoxy", "—", "Polane", "Source product combination"]
      ],
      notes: ["For safety showers, the system page specifies green tape wrap over the insulation jacket."]
    }],
    ["G-3E", "Indoor electrical equipment and general building/control-room exposed steel", "SSPC-SP1; degrease fasteners; hand/power-tool clean and/or brush blast. Indoor electrical equipment may use SP2, SP3 or SP6; test WFT/DFT.", "Alkyd primer plus alkyd finish; continuous temperature resistance shown as 150°F.", {
      pages: "24-25", service: "General building/control-room and indoor electrical service.",
      manufacturers: [
        ["Ameron", "5105", "—", "5405", "DFT 2 / 1.5 mil"],
        ["Carboline", "Rustarmor 29", "—", "Subsil 30", "DFT 3 / 3 mil"],
        ["International", "Interlac 298 HS", "—", "Interlac 820", "DFT 3 / 1.5 mil"],
        ["Sherwin-Williams", "Kem Kromik", "—", "Universal Industrial Enamel", "DFT 3.5 / 3 mil"]
      ]
    }],
    ["G-5", "Electric motors and pumps in moderate chemical service", "SSPC-SP1; degrease fasteners; neutralize chemical contamination as specified; clean-water wash; SP2/SP3/SP6/SP10 as applicable; test WFT/DFT.", "Two-coat epoxy system.", {
      pages: "26-27", service: "Motors/pumps; synopsis lists 225°F coating resistance while application guide describes ambient to 200°F.",
      manufacturers: [
        ["Ameron", "385 PA", "—", "385", "DFT 4 / 4 mil"],
        ["Carboline", "890", "—", "801", "DFT 5 / 5 mil"],
        ["DuPont", "25P", "—", "25P", "DFT 5 / 5 mil"],
        ["International", "Interseal 385", "—", "Interseal 385", "DFT 5 / 5 mil"],
        ["Sherwin-Williams", "Tile Clad Hi Solids Epoxy", "—", "Hi Solids Epoxy", "DFT 3.5 / 5.5 mil"]
      ]
    }],
    ["G-6A", "Uninsulated mechanical equipment, piping, vessels, tanks/spheres and structural steel", "SSPC-SP1; degrease fasteners; neutralize contamination; minimum 2500-psig clean-water wash; dry completely; SP2/SP3/SP5/SP6/SP10 as applicable; test WFT/DFT.", "Epoxy primer / epoxy intermediate / urethane finish.", {
      pages: "28-29", service: "Surface temperature -40°F to 200°F; moderate chemical exposure/general exposed steel service.",
      manufacturers: [
        ["Ameron", "385 PA", "385", "450H", "DFT 4 / 4 / 2 mil"],
        ["Carboline", "893", "890", "133", "DFT 5 / 5 / 4 mil"],
        ["DuPont", "25P", "25P", "326 Imron", "DFT 4 / 5 / 1.5 mil"],
        ["International", "Interseal 385", "Interseal 385", "Interthane 990 HS", "DFT 5 / 5 / 3 mil"],
        ["Sherwin-Williams", "Macropoxy HS", "Macropoxy HS", "B65 Series", "DFT 4.5 / 4.5 / 3 mil"]
      ]
    }],
    ["G-6C", "Equipment/structures requiring intumescent fireproofing", "Bare steel: SP1, degrease, neutralize, minimum 2500-psig wash, SP5 white-metal blast, 1.5-mil minimum profile. Galvanized steel: SP1, degrease, power wash, SP7 brush blast, 1.5-mil minimum profile. Test WFT/DFT; primer pull test required.", "Epoxy primer under intumescent fireproofing; source synopsis lists 4 mil primer DFT.", {
      pages: "30-31", service: "Steel surface temperature below 160°F.",
      manufacturers: [
        ["Ameron / Carboline", "Amercoat 400 if hand-prepped; Ameron 385PA if sandblasted", "Carboline Thermo-Lag 3000 fireproofing", "Amercoat 450HS shown in source table", "Primer DFT 4 mil"]
      ],
      notes: ["Primer pull test is explicitly required by the system page."]
    }],
    ["G-9A", "Uninsulated mechanical equipment, piping, vessels, tanks/spheres and structural steel; high temperature", "SSPC-SP1; degrease fasteners; neutralize contamination; minimum 2500-psig wash; dry; SP2/SP3/SP6/SP10; test WFT/DFT.", "Inorganic-zinc primer with silicone high-temperature coat(s).", {
      pages: "32-33", service: "Uninsulated service up to 750°F; chemical splash/spillage/fume exposure described on system page.",
      manufacturers: [
        ["Ameron", "Dimetcote 21-5", "N/R", "741", "Use source/PDS for coat-specific DFT"],
        ["Carboline", "CZ11 VOC", "1248 (optional)", "1248", "Use source/PDS for coat-specific DFT"],
        ["DuPont", "347-Y-912", "612-706", "612-706", "Use source/PDS for coat-specific DFT"],
        ["International", "Interzinc 22HS", "Intertherm 875", "Intertherm 875", "Use source/PDS for coat-specific DFT"],
        ["Sherwin-Williams", "Zinc Clad II", "N/R", "FC900", "Use source/PDS for coat-specific DFT"]
      ]
    }],
    ["G-9B", "Heavy chemical exposure uninsulated service; cold insulated/sweating service", "SSPC-SP1; degrease; neutralize contamination; minimum 2500-psig wash; dry; SP2/SP3/SP6/SP10; test WFT/DFT.", "Epoxy primer plus epoxy finish; intermediate not required.", {
      pages: "34-35", service: "Uninsulated heavy chemical/water/oil/salt/caustic exposure to 250°F; cold insulated or sweating service with moderate chemical exposure to 140°F.",
      manufacturers: [
        ["Ameron", "90 HS", "—", "90 HS", "DFT 5 / 5 mil"],
        ["Carboline", "Thermoline 450", "—", "Thermoline 450", "DFT 5 / 5 mil"],
        ["International", "Intertuf 132", "—", "Intertuf 132", "DFT 5 / 5 mil; source note permits one 10-mil coat"]
      ]
    }],
    ["G-13", "Maintenance shop and inside fixed equipment", "SSPC-SP1; degrease fasteners; SP2/SP3; remove cleaning dust; test WFT/DFT.", "Acrylic primer and acrylic finish.", {
      pages: "36-37", service: "Protected, dry/mild interior service; surface temperature below 150°F.",
      manufacturers: [
        ["Ameron", "Amercoat 220", "—", "Amercoat 220", "DFT 2 / 2 mil"],
        ["Carboline", "3358", "—", "3359", "DFT 3 / 3 mil"],
        ["DuPont", "N/A", "—", "N/A", "Listed N/A"],
        ["International", "Intercryl 510 WB", "—", "Intercryl 520WB", "DFT 2.5 / 2 mil"],
        ["Sherwin-Williams", "DTM Primer", "—", "DTM Acrylic", "DFT 2.5 / 2.5 mil"]
      ]
    }],
    ["G-14", "Potable-water tank interior", "Remove old coating by blasting; degrease; SP1; grind corrosion/spatter/sharp edges/corners/gouges/porosity; SP5 weld seams and stripe; SP5 interior; spark-test primer and repairs; test WFT/DFT.", "Epoxy lining system; primer and epoxy finish.", {
      pages: "38-39", service: "Potable-water immersion; system synopsis is below 150°F, while the application guide describes immersion to 120°F and dry service to 200°F.",
      manufacturers: [
        ["Ameron", "Amercoat 395", "—", "Amercoat 395", "Synopsis DFT 4 / 7 mil"],
        ["Carboline", "891", "—", "891", "DFT 8 / 8 mil"],
        ["DuPont", "525-450", "—", "525-450", "DFT 4 / 4 mil"],
        ["International", "Interline 785HS", "—", "Interline 785HS", "DFT 6 / 6 mil"],
        ["Sherwin-Williams", "Pot H2O Epoxy", "—", "Pot H2O Epoxy", "DFT 6 / 6 mil"]
      ],
      notes: ["Spark testing of the primer coat is explicitly required."]
    }],
    ["G-15A", "Brine-storage tank interior", "New plate SP5 both sides before shipment; existing steel: minimum 2500-psig 1% Chlor-Rid wash and remove old coating; SCAT each steel sheet; grind repairs/defects; SP5 weld seams and stripe; SP5 interior; spark-test primer; test WFT/DFT.", "Immersion lining system; generic coating type varies by manufacturer.", {
      pages: "40-41", service: "Brine immersion; surface temperature below 180°F.",
      manufacturers: [
        ["Ameron", "Amercoat 351", "—", "Amercoat 351", "Synopsis DFT 8 / 8 mil"],
        ["Carboline", "Phenoline 300", "Phenoline 302", "Phenoline 302", "Synopsis DFT 8 / 8 / 8 mil"],
        ["DuPont", "347-Y-912", "25P", "25P", "Source synopsis lists 3 / 6.5 / 6.5; verify PDS"],
        ["International", "Interline 500", "—", "Interline 500", "Synopsis DFT 10 / 10 mil"],
        ["Sherwin-Williams", "Phenicon", "—", "Phenicon", "Synopsis DFT 6 / 6 mil"]
      ],
      notes: ["SCAT chloride testing on each steel sheet and spark testing are specifically required by the system page."]
    }],
    ["G-16B", "Uninsulated steel piping, tanks, vessels, exchangers and supporting structure", "SSPC-SP1; degrease; neutralize acidic/caustic contamination; minimum 2500-psig wash; dry; SP2/SP3/SP5/SP6/SP10; test WFT/DFT.", "Generic synopsis: epoxy primer / epoxy intermediate / urethane finish.", {
      pages: "42-43", service: "Up to 200°F dry or 140°F wet; Zone 2A water-treatment exposure.",
      manufacturers: [
        ["Ameron", "Amercoat 385PA", "Amercoat 385", "Amercoat 385", "Synopsis DFT 4 / 4 / 2 mil"],
        ["Carboline", "893", "890", "890", "Synopsis DFT 5 / 5 / 4 mil"],
        ["International", "Interseal 385", "Interseal 385", "Interseal 385", "Synopsis DFT 6 / 6 / 2 mil"],
        ["Sherwin-Williams", "HS Cat Epoxy", "HS Cat Epoxy", "HS Cat Epoxy", "Synopsis DFT 5 / 5 / 3 mil"]
      ],
      notes: ["The generic synopsis identifies a urethane finish, while several manufacturer rows on the system product page show epoxy products in the finish column. Preserve the controlled source and verify the selected manufacturer/PDS.", "Ameron note: glass flake 880 may be added for extra moisture-permeation resistance, changing DFT and coverage."]
    }],
    ["G-17", "Uninsulated equipment and exhaust stacks; high-temperature service", "SSPC-SP1; degrease; brush blast; SP2/SP3; SP5 or SP10; test WFT/DFT.", "Inorganic-zinc primer with silicone/high-temperature finish.", {
      pages: "44-45", service: "Uninsulated service up to 750°F; Zones 3A through 3C are noted.",
      manufacturers: [
        ["Ameron", "Dimetcote 21-5", "—", "PSX 892HS", "Source notes: white-metal blast required for primer; PSX 892HS not recommended for thermal cycling"],
        ["Carboline", "4631", "—", "4631", "Source synopsis/product table shows approximately 1.5 / 1.5 mil DFT"],
        ["Sherwin-Williams", "FC 1500", "—", "FC 1500", "Source synopsis/product table shows approximately 1.2 / 1.2 mil DFT"]
      ]
    }],
    ["G-21", "Insulated or uninsulated tanks, vessels, exchangers and piping; wet/dry temperature cycling", "SSPC-SP1; degrease; do not use chlorinated solvents; blast with DuPont Starblast or aluminum oxide for a 1-2 mil profile; test WFT/DFT.", "Glass-filled novolac epoxy primer and finish; source synopsis lists 5 mil DFT each for Carboline.", {
      pages: "46-47", service: "Moderate chemical fumes/spillage; wet/dry cycling; source synopsis lists 425°F.",
      manufacturers: [
        ["Carboline", "Thermoline 450", "—", "Thermoline 450", "DFT 5 / 5 mil"]
      ],
      notes: ["System product page states Part A contains MEK and waste containing Part A must be segregated for separate disposal."]
    }],
    ["G-22", "Uninsulated equipment, piping, vessels and structural steel in HCl/severe chemical exposure", "SSPC-SP1; degrease; neutralize with 5-10% soda ash; minimum 2500-psig clean-water wash plus 1% Chlor-Rid wash; dry; SP2/SP3/SP5; test WFT/DFT.", "Epoxy primer / epoxy-phenolic intermediate / siloxane finish.", {
      pages: "48-49", service: "-40°F to 200°F; Zone 3E severe chemical/HCl exposure; excludes sweating equipment.",
      manufacturers: [
        ["Ameron", "385 PA", "90HS", "PSX 700", "Source synopsis lists 6-mil values; verify coat-specific PDS"],
        ["International", "Interseal 385", "Source intermediate product label is unclear in scanned table", "Interseal 385", "FCA321 note to 40°F / 10-hour recoat shown; verify controlled copy"],
        ["Sherwin-Williams", "Dura-Plate 154Y", "Dura-Plate", "Dura-Plate", "Source synopsis lists 15-mil values; verify coat-specific PDS"]
      ]
    }],
    ["G-23A", "Hot insulated piping, tanks, vessels and exchangers", "SP1; neutralize acidic/caustic/brine contamination as specified; source system page states: white metal blast per SSPC-SP6, or SP11 power-tool cleaning if blasting is not possible; test WFT/DFT.", "Hi-Temp 1027, up to three coats as needed, 5-6 mil DFT each; open recoat window.", {
      pages: "50-51", service: "Hot insulated service up to 1,200°F. Product page states Hi-Temp 1027 can be applied to hot metal up to 500°F.",
      manufacturers: [["Hi-Temp Coatings", "Hi-Temp 1027", "Hi-Temp 1027 if needed", "Hi-Temp 1027", "5-6 mil DFT per coat"]],
      discrepancy: SP56_WARNING
    }],
    ["G-23B", "Insulated piping, tanks, vessels and exchangers; aluminum-flake system", "SP1; neutralize acidic/caustic/brine contamination as specified; source system page states: white metal blast per SSPC-SP6, or SP11 power-tool cleaning if blasting is not possible; test WFT/DFT.", "International Intertherm 751 CSA primer and finish; 4-6 mil DFT each; 16-hour minimum recoat.", {
      pages: "52-53", service: "Insulated service -20°F to 750°F; metallic aluminum-flake pigmentation. Product page states application to hot metal up to 248°F.",
      manufacturers: [["International", "Intertherm 751 CSA", "—", "Intertherm 751 CSA", "DFT 4-6 / 4-6 mil"]],
      discrepancy: SP56_WARNING
    }],
    ["G-23C", "Coal-tar epoxy for immersion, sweating or insulated equipment", "SP1; neutralize acidic/caustic/brine contamination as specified; source system page states: white metal blast per SSPC-SP6, or SP11 power-tool cleaning if blasting is not possible; test WFT/DFT; spark-test tank-lining primer.", "Coal-tar epoxy primer and finish; source synopsis lists 6-8 mil DFT per coat.", {
      pages: "54-55", service: "Immersion/sweating/insulated equipment up to 140°F.",
      manufacturers: [["Ameron", "Amercoat 78HB", "—", "Amercoat 78HB", "DFT 6-8 / 6-8 mil per synopsis"]],
      discrepancy: SP56_WARNING,
      notes: ["For tank linings, spark testing after the primer coat is required."]
    }],
    ["G-24", "W. BTT tank interior; epoxy-novolac immersion lining", "SP1; neutralize acidic/caustic/brine contamination as specified; SP5 white-metal blast; test WFT/DFT; spark-test primer.", "KCC Plus-E 3.2 primer / KCC EN-25.3 flake-filled intermediate / KCC EN-25.3 flake-filled finish; DFT 3-4 / 25 / 25 mil.", {
      pages: "56-57", service: "System page: 140°F immersion / 350°F dry. Appendix A systems list describes dry service to 300°F; preserve this source difference and verify for the job.",
      manufacturers: [["KCC", "KCC Plus-E 3.2", "KCC EN-25.3", "KCC EN-25.3", "DFT 3-4 / 25 / 25 mil"]],
      notes: ["Product table identifies 622 solvent for primer cleanup.", "Spark testing after primer is required."]
    }],
    ["G-25", "Oxidized steel; hand-prep, surface-tolerant touch-up coating", "SP1; remove loose scale/rust/paint by SP11, wire brushing and/or power washing; neutralize acidic/caustic/brine contamination; test WFT/DFT.", "Rust converter followed by epoxy coat(s), with epoxy or urethane finish as selected.", {
      pages: "58-59", service: "Maintenance/touch-up on oxidized steel where blast preparation is not practical.",
      manufacturers: [["Enrust / Ameron", "Enrust rust converter", "Amerlock 400 / Amercoat 385", "Amercoat 385 or Amercoat 450H", "Use the controlled product table/PDS for selected coat DFT"]],
      notes: ["Source states two coats of Amercoat 385 may be used, or one coat of 385 and one coat of 450H urethane.", "Source note states dry-temperature resistance can be 425°F if 880 glass flake is added."]
    }],
    ["G-26", "Moisture-tolerant coating for damp or sweating steel", "SP1; neutralize acidic/caustic/brine contamination; source system page states SP2 hand-tool cleaning, or white metal blast per SSPC-SP6, or SP11 if blasting is not possible; test WFT/DFT.", "Sherwin-Williams Dura-Plate MT primer and finish; 6-8 mil DFT each; 12-hour to 14-day recoat window.", {
      pages: "60-61", service: "Damp/sweating steel; source synopsis lists 250°F temperature resistance.",
      manufacturers: [["Sherwin-Williams", "Dura-Plate MT", "—", "Dura-Plate MT", "DFT 6-8 / 6-8 mil"]],
      discrepancy: SP56_WARNING
    }],
    ["G-27", "New process equipment, general service, uninsulated and painted offsite", "SP1 followed by SP5 white-metal blast; do not allow blasted steel to remain uncoated overnight; test WFT/DFT.", "Inorganic-zinc-silicate primer / epoxy intermediate / aliphatic-polyurethane finish; DFT 3 / 6 / 2-3 mil.", {
      pages: "62-63", service: "New process equipment, general service, uninsulated; up to 200°F.",
      manufacturers: [["Ameron", "Dimetcote 21-5 / 4A", "Amercoat 385", "Amercoat 450H", "DFT 3 / 6 / 2-3 mil"]],
      notes: ["Product page warns not to allow standing water to remain on primed surfaces."]
    }]
  ];

  const INSPECTION_CONTROLS = [
    "Purchase-order requirements govern if they conflict with PDES-8001; deviations to the standard require the specified approval process.",
    "Commercial-, near-white-, or white-metal blasted surfaces are to be primed within the same work shift.",
    "Anchor profile is to meet the paint manufacturer's recommendation or be within 1.5-2.5 mils unless a system-specific requirement controls.",
    "New steel preparation includes removal/grinding of sharp corners and edges, gouges, weld porosity/spatter, flux and slag; SCAT chloride checks and stripe coating are specified where applicable.",
    "Do not apply paint when the surface temperature is 5°F or less above dew point, or when ambient/surface/paint temperature or relative humidity is outside the manufacturer's limits.",
    "Observe manufacturer minimum and maximum recoat times.",
    "Pressure equipment and piping are not to be field painted until required field heat treatment, inspection and testing are complete; paint is not to be applied within 2 inches of a welded field joint until welding and hydrotesting are complete, subject to the specification's stated exception process.",
    "Inspection records include ambient temperature and dew point daily, plus WFT/DFT of each coat on every plate/component and at least three measurements on pipe (each end and middle).",
    "Anchor-pattern testing is required before prime coating. SCAT and spark testing are required where specified.",
    "Final coating is to be free of dirt, runs, sags, pinholes, blisters and other injurious defects; failed areas are to be redone.",
    "After painting, stencil the paint names (primer/intermediate/finish), paint-system number and date on equipment.",
    "Do not handle or ship until final cure is achieved; protect finished coating during lifting, transport and storage.",
    "Vendor/fabricator documentation includes paint manufacturer, primer/intermediate/finish product names, manufacturer data sheet, final DFT and surface-preparation procedure(s)."
  ];

  function escapeHTML(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function installLibrary() {
    const data = window.MileageActiveJobsData;
    if (!data?.coatingSystems) return false;
    data.coatingSystems.Plaquemine = SYSTEMS;
    return true;
  }

  function readState() {
    try { return JSON.parse(localStorage.getItem("mileage_logger_state_v3") || "{}"); }
    catch (_) { return {}; }
  }

  function activeJobById(id) {
    if (!id) return null;
    const state = readState();
    const manager = window.MileageActiveJobsManagement;
    const seed = window.MileageActiveJobsData?.activeJobs || [];
    const jobs = typeof manager?.getActiveJobs === "function" ? manager.getActiveJobs(state) : seed;
    const job = (jobs || []).find((item) => item?.aj === id) || seed.find((item) => item?.aj === id) || null;
    return job && window.MileageActiveJobsData?.normalizedJob
      ? window.MileageActiveJobsData.normalizedJob(job)
      : job;
  }

  function selectedSystem() {
    const code = document.getElementById("coatingSystem")?.value || "";
    return SYSTEMS.find((item) => item[0] === code) || null;
  }

  function productTable(manufacturers) {
    if (!manufacturers?.length) return "";
    return `<div style="overflow-x:auto"><table style="width:100%;border-collapse:collapse;margin-top:.5rem"><thead><tr><th style="text-align:left;padding:.35rem">Manufacturer</th><th style="text-align:left;padding:.35rem">Primer</th><th style="text-align:left;padding:.35rem">Intermediate</th><th style="text-align:left;padding:.35rem">Finish</th><th style="text-align:left;padding:.35rem">DFT / source note</th></tr></thead><tbody>${manufacturers.map((row) => `<tr>${row.map((cell) => `<td style="vertical-align:top;padding:.35rem;border-top:1px solid currentColor">${escapeHTML(cell)}</td>`).join("")}</tr>`).join("")}</tbody></table></div>`;
  }

  function renderReference() {
    if (!installLibrary()) return;
    const box = document.getElementById("coatingRequirementSummary");
    const activeJobId = document.getElementById("inspectionActiveJobId")?.value || "";
    const job = activeJobById(activeJobId);
    const system = selectedSystem();
    if (!box || job?.facility !== "Plaquemine" || !system) return;
    if (box.querySelector("[data-westlake-reference]")?.dataset.system === system[0]) return;

    const detail = system[4] || {};
    const notes = (detail.notes || []).map((note) => `<li>${escapeHTML(note)}</li>`).join("");
    const discrepancy = detail.discrepancy
      ? `<div class="gps-status warn" style="margin-top:.65rem"><strong>Specification discrepancy</strong><br>${escapeHTML(detail.discrepancy)}</div>`
      : "";

    box.innerHTML = `
      <div data-westlake-reference data-system="${escapeHTML(system[0])}">
        <strong>Westlake Plaquemine — Coating System ${escapeHTML(system[0])}</strong>
        <div class="muted" style="margin-top:.2rem">${escapeHTML(SOURCE.title)} • Rev. ${escapeHTML(SOURCE.revision)} • ${escapeHTML(SOURCE.date)} • system pages ${escapeHTML(detail.pages || "—")}</div>
        <div class="muted" style="margin-top:.2rem">${escapeHTML(SOURCE.revisionNote)}</div>
        <p><strong>Application:</strong> ${escapeHTML(system[1])}</p>
        ${detail.service ? `<p><strong>Service:</strong> ${escapeHTML(detail.service)}</p>` : ""}
        <p><strong>Surface preparation:</strong> ${escapeHTML(system[2])}</p>
        <p><strong>System / DFT:</strong> ${escapeHTML(system[3])}</p>
        ${discrepancy}
        <details style="margin-top:.65rem">
          <summary><strong>Approved products / detailed source table</strong></summary>
          ${productTable(detail.manufacturers || [])}
          ${notes ? `<ul>${notes}</ul>` : ""}
          <p class="muted"><strong>Control:</strong> Product names and values are transcribed from PDES-8001. Confirm the controlled project requirement and current manufacturer PDS before acceptance, particularly where the source table is unclear or internally inconsistent.</p>
        </details>
        <details style="margin-top:.5rem">
          <summary><strong>Westlake coating inspection requirements</strong></summary>
          <ul>${INSPECTION_CONTROLS.map((item) => `<li>${escapeHTML(item)}</li>`).join("")}</ul>
        </details>
      </div>`;
  }

  installLibrary();
  document.addEventListener("change", (event) => {
    if (["coatingSystem", "inspectionActiveJobId"].includes(event.target?.id)) setTimeout(renderReference, 0);
  }, true);
  window.addEventListener("mileage:state-changed", () => setTimeout(renderReference, 0));

  const observer = new MutationObserver(() => renderReference());
  observer.observe(document.documentElement, { childList: true, subtree: true });
  setTimeout(renderReference, 0);

  window.MileageWestlakeCoatingReference = Object.freeze({
    source: SOURCE,
    systems: SYSTEMS,
    inspectionControls: INSPECTION_CONTROLS,
    renderReference
  });
})();