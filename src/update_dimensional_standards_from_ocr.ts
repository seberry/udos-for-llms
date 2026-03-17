import * as fs from 'fs';
import * as path from 'path';

interface NormalizedRow {
  source_row_index: number;
  label: string;
  parameter: string;
  value: string;
  notes?: string;
  is_inferred?: boolean;
  is_header?: boolean;
  page: number;
  table_ref: string;
  source_text: string;
}

interface NormalizedTable {
  table_ref: string;
  table_title: string;
  pages: number[];
  normalized_at: string;
  rows: NormalizedRow[];
}

// Page numbers for each table based on existing data
const TABLE_PAGES: Record<string, [number, number]> = {
  '02-2': [23, 23],
  '02-3': [25, 25],
  '02-4': [27, 27],
  '02-5': [29, 29],
  '02-6': [31, 31],
  '02-7': [33, 33],
  '02-8': [35, 35],
  '02-9': [37, 37],
  '02-10': [39, 39],
  '02-11': [41, 41],
  '02-12': [43, 43],
  '02-13': [45, 45],
  '02-14': [47, 47],
  '02-21': [61, 61],
  '02-22': [63, 63],
  '02-23': [65, 65],
};

// Parsed markdown data
const OCR_DATA: Record<string, { title: string; sections: Array<{ name: string; rows: Array<{ label: string; parameter: string; value: string; notes?: string }> }> }> = {
  '02-2': {
    title: 'Table 02-2: R1 District Dimensional Standards',
    sections: [
      {
        name: 'Lot Dimensions (Minimum, only for lots created after the effective date)',
        rows: [
          { label: 'A', parameter: 'Lot area', value: '20,000 sq ft (0.459 acres)', notes: 'See §20.04.110 (Incentives) for alternative standards' },
          { label: 'B', parameter: 'Lot width', value: '100 ft', notes: 'See §20.04.110 (Incentives) for alternative standards' },
        ]
      },
      {
        name: 'Building Setbacks (Minimum)',
        rows: [
          { label: 'C', parameter: 'Front', value: '15 ft', notes: '' },
          { label: 'D', parameter: 'Attached front-loading garage or carport', value: '25 ft', notes: 'Or equal to the setback of the primary structure, whichever is greater' },
          { label: 'E', parameter: 'Side (first floor)', value: '8 ft', notes: 'See §20.04.110 (Incentives) for alternative standards' },
          { label: 'E', parameter: 'Side (each story above ground floor)', value: '10 ft', notes: 'See §20.04.110 (Incentives) for alternative standards' },
          { label: 'F', parameter: 'Rear', value: '25 ft', notes: 'See §20.04.110 (Incentives) for alternative standards' },
        ]
      },
      {
        name: 'Other Standards',
        rows: [
          { label: '', parameter: 'Impervious surface coverage (max)', value: '30%', notes: '' },
          { label: 'G', parameter: 'Primary structure height (max)', value: '40 ft', notes: '' },
          { label: '', parameter: 'Accessory structure height (max)', value: '20 ft', notes: '' },
        ]
      }
    ]
  },
  '02-3': {
    title: 'Table 02-3: R2 District Dimensional Standards',
    sections: [
      {
        name: 'Lot Dimensions (Minimum, only for lots created after the effective date)',
        rows: [
          { label: 'A', parameter: 'Lot area', value: '7,200 sq ft (0.165 acres)', notes: 'See §20.04.110 (Incentives) for alternative standards' },
          { label: 'B', parameter: 'Lot width', value: '60 ft', notes: 'See §20.04.110 (Incentives) for alternative standards' },
        ]
      },
      {
        name: 'Building Setbacks (Minimum)',
        rows: [
          { label: 'C', parameter: 'Front', value: '15 ft or the median front setback of abutting residential structures, whichever is less', notes: '' },
          { label: 'D', parameter: 'Attached front-loading garage or carport', value: '25 ft', notes: 'Or equal to the setback of the primary structure, whichever is greater' },
          { label: 'E', parameter: 'Side (first floor)', value: '8 ft', notes: 'Legally established lots of record that are less than the minimum lot width may reduce the required setback up to 2 ft' },
          { label: 'E', parameter: 'Side (each story above ground floor)', value: '10 ft', notes: 'See §20.04.110 (Incentives) for alternative standards; Legally established lots of record that are less than the minimum lot width may reduce the required setback up to 2 ft' },
          { label: 'F', parameter: 'Rear', value: '25 ft', notes: 'See §20.04.110 (Incentives) for alternative standards' },
        ]
      },
      {
        name: 'Other Standards',
        rows: [
          { label: '', parameter: 'Impervious surface coverage (max)', value: '40%', notes: '' },
          { label: 'G', parameter: 'Primary structure height (max)', value: '40 ft', notes: '' },
          { label: '', parameter: 'Accessory structure height (max)', value: '20 ft', notes: '' },
        ]
      }
    ]
  },
  '02-4': {
    title: 'Table 02-4: R3 District Dimensional Standards',
    sections: [
      {
        name: 'Lot Dimensions (Minimum, only for lots created after the effective date)',
        rows: [
          { label: 'A', parameter: 'Lot area', value: '5,000 sq ft (0.115 acres)', notes: 'See §20.04.110 (Incentives) for alternative standards' },
          { label: 'B', parameter: 'Lot width', value: '50 ft', notes: 'See §20.04.110 (Incentives) for alternative standards' },
        ]
      },
      {
        name: 'Building Setbacks (Minimum)',
        rows: [
          { label: 'C', parameter: 'Front build-to line', value: '15 ft or the median front setback of abutting residential structures, whichever is less', notes: '' },
          { label: '', parameter: 'Attached front-loading garage or carport', value: '10 ft behind the primary structure\'s front building wall', notes: '' },
          { label: 'D', parameter: 'Side (first floor)', value: '6 ft', notes: 'Legally established narrow lots may reduce setback up to 2 ft; Reduce by 2 ft if adjacent to a platted alley' },
          { label: 'D', parameter: 'Side (each story above ground floor)', value: '10 ft', notes: 'See §20.04.110 (Incentives) for alternative standards; Legally established narrow lots may reduce setback up to 2 ft; Reduce by 2 ft if adjacent to a platted alley' },
          { label: 'E', parameter: 'Rear', value: '25 ft', notes: 'See §20.04.110 (Incentives) for alternative standards; Reduce by 10 ft if adjacent to a platted alley' },
        ]
      },
      {
        name: 'Other Standards',
        rows: [
          { label: '', parameter: 'Impervious surface coverage (max)', value: '45%', notes: '' },
          { label: 'F', parameter: 'Primary structure height (max)', value: '35 ft', notes: '' },
          { label: '', parameter: 'Accessory structure height (max)', value: '20 ft', notes: '' },
        ]
      }
    ]
  },
  '02-5': {
    title: 'Table 02-5: R4 District Dimensional Standards',
    sections: [
      {
        name: 'Lot Dimensions (Minimum, only for lots created after the effective date)',
        rows: [
          { label: 'A', parameter: 'Lot area', value: '4,000 sq ft (0.092 acres)', notes: '' },
          { label: 'B', parameter: 'Lot width', value: '35 ft', notes: '' },
        ]
      },
      {
        name: 'Building Setbacks (Minimum)',
        rows: [
          { label: 'C', parameter: 'Front', value: '15 ft or the median front setback of abutting residential structures, whichever is less', notes: '' },
          { label: '', parameter: 'Attached front-loading garage or carport', value: '10 ft behind the primary structure\'s front building wall', notes: '' },
          { label: 'D', parameter: 'Side', value: '5 ft', notes: 'Reduce by 2 ft if adjacent to a platted alley' },
          { label: 'E', parameter: 'Rear', value: '25 ft', notes: 'Reduce by 10 ft if adjacent to a platted alley' },
        ]
      },
      {
        name: 'Other Standards',
        rows: [
          { label: '', parameter: 'Impervious surface coverage (max)', value: '50%', notes: '' },
          { label: 'F', parameter: 'Primary structure height (max)', value: '40 ft', notes: '' },
          { label: '', parameter: 'Accessory structure height (max)', value: '20 ft', notes: '' },
        ]
      }
    ]
  },
  '02-6': {
    title: 'Table 02-6: RM District Dimensional Standards',
    sections: [
      {
        name: 'Lot Dimensions (Minimum, only for lots created after the effective date)',
        rows: [
          { label: 'A', parameter: 'Lot area', value: '5,000 sq ft (0.115 acres)', notes: '' },
          { label: 'B', parameter: 'Lot width', value: '50 ft', notes: '' },
        ]
      },
      {
        name: 'Building Setbacks (Minimum)',
        rows: [
          { label: 'C', parameter: 'Front', value: '15 ft', notes: '' },
          { label: '', parameter: 'Attached front-loading garage or carport', value: '25 ft', notes: 'Or equal to the setback of the primary structure, whichever is greater' },
          { label: 'D', parameter: 'Side', value: '10 ft', notes: 'Buildings abutting R1, R2, R3, or R4 must comply with §20.04.070(d)(5)' },
          { label: 'E', parameter: 'Rear', value: '15 ft', notes: 'Buildings abutting R1, R2, R3, or R4 must comply with §20.04.070(d)(5)' },
        ]
      },
      {
        name: 'Other Standards',
        rows: [
          { label: '', parameter: 'Front parking setback (min)', value: '20 ft behind primary structure\'s front building wall', notes: '' },
          { label: '', parameter: 'Impervious surface coverage (max)', value: '60%', notes: '' },
          { label: '', parameter: 'Landscape area (min)', value: '40%', notes: '' },
          { label: 'F', parameter: 'Primary structure height (max)', value: '3 stories, not to exceed 40 ft', notes: 'Buildings abutting R1, R2, R3, or R4 must comply with §20.04.070(d)(5); See §20.04.110 (Incentives)' },
          { label: '', parameter: 'Accessory structure height (max)', value: '20 ft', notes: '' },
        ]
      }
    ]
  },
  '02-7': {
    title: 'Table 02-7: RH District Dimensional Standards',
    sections: [
      {
        name: 'Lot Dimensions (Minimum, only for lots created after the effective date)',
        rows: [
          { label: 'A', parameter: 'Lot area', value: '5,000 sq ft (0.115 acres)', notes: '' },
          { label: 'B', parameter: 'Lot width', value: '50 ft', notes: '' },
        ]
      },
      {
        name: 'Building Setbacks (Minimum)',
        rows: [
          { label: 'C', parameter: 'Front', value: '15 ft', notes: '' },
          { label: '', parameter: 'Attached front-loading garage or carport', value: '25 ft', notes: 'Or equal to the setback of the primary structure, whichever is greater' },
          { label: 'D', parameter: 'Side', value: '10 ft', notes: 'Buildings abutting R1, R2, R3, or R4 must comply with §20.04.070(d)(5)' },
          { label: 'E', parameter: 'Rear', value: '15 ft', notes: 'Buildings abutting R1, R2, R3, or R4 must comply with §20.04.070(d)(5)' },
        ]
      },
      {
        name: 'Other Standards',
        rows: [
          { label: '', parameter: 'Front parking setback (min)', value: '20 ft behind primary structure\'s front building wall', notes: '' },
          { label: '', parameter: 'Impervious surface coverage (max)', value: '65%', notes: '' },
          { label: '', parameter: 'Landscape area (min)', value: '35%', notes: '' },
          { label: 'F', parameter: 'Primary structure height (max)', value: '5 stories, not to exceed 63 ft', notes: 'Buildings abutting R1, R2, R3, or R4 must comply with §20.04.070(d)(5); See §20.04.110 (Incentives)' },
          { label: '', parameter: 'Accessory structure height (max)', value: '20 ft', notes: '' },
        ]
      }
    ]
  },
  '02-8': {
    title: 'Table 02-8: RMH District Dimensional Standards',
    sections: [
      {
        name: 'Lot Dimensions (Minimum, only for lots created after the effective date)',
        rows: [
          { label: 'A', parameter: 'Lot area', value: 'Entire Dev: 43,560 sq ft (1.0 acres)<br>Dwelling Site: 3,000 sq ft', notes: '' },
          { label: 'B/C', parameter: 'Lot width', value: 'Entire Dev: 200 ft<br>Dwelling Site: 40 ft', notes: '' },
        ]
      },
      {
        name: 'Setbacks for Development as a Whole (Minimum)',
        rows: [
          { label: 'D/E', parameter: 'Front', value: 'Entire Dev: 25 ft<br>Dwelling Site: 10 ft', notes: '' },
          { label: 'F', parameter: 'Side', value: 'Entire Dev: 20 ft<br>Dwelling Site: Primary Structure 7 ft; Accessory Structure 2 ft', notes: '' },
          { label: 'G', parameter: 'Rear', value: 'Entire Dev: 20 ft<br>Dwelling Site: Primary Structure 7 ft; Accessory Structure 2 ft', notes: '' },
        ]
      },
      {
        name: 'Other Standards',
        rows: [
          { label: '', parameter: 'Impervious surface coverage (max)', value: 'Entire Dev: None<br>Dwelling Site: 65%', notes: '' },
          { label: 'H', parameter: 'Primary structure height (max)', value: 'Entire Dev: None<br>Dwelling Site: 20 ft', notes: '' },
          { label: '', parameter: 'Accessory structure height (max)', value: 'Entire Dev: None<br>Dwelling Site: 20 ft', notes: '' },
        ]
      }
    ]
  },
  '02-9': {
    title: 'Table 02-9: MS District Dimensional Standards',
    sections: [
      {
        name: 'Lot Dimensions (Minimum, only for lots created after the effective date)',
        rows: [
          { label: 'A', parameter: 'Lot area', value: '5,000 sq ft (0.115 acres)', notes: '' },
          { label: 'B', parameter: 'Lot width', value: '50 ft', notes: '' },
        ]
      },
      {
        name: 'Building Setbacks (Minimum)',
        rows: [
          { label: 'C', parameter: 'Front', value: '15 ft', notes: '' },
          { label: 'D', parameter: 'Side', value: '15 ft', notes: 'Buildings abutting R1, R2, R3, or R4 must comply with §20.04.070(d)(5)' },
          { label: 'E', parameter: 'Rear', value: '15 ft', notes: 'Buildings abutting R1, R2, R3, or R4 must comply with §20.04.070(d)(5)' },
        ]
      },
      {
        name: 'Other Standards',
        rows: [
          { label: 'F', parameter: 'Front parking setback (min)', value: '20 ft behind primary structure\'s front building wall', notes: '' },
          { label: '', parameter: 'Impervious surface coverage (max)', value: '70%', notes: '' },
          { label: '', parameter: 'Landscape area (min)', value: '30%', notes: '' },
          { label: 'G', parameter: 'Primary structure height (max)', value: '6 stories, not to exceed 75 ft', notes: 'Buildings abutting R1, R2, R3, or R4 must comply with §20.04.070(d)(5); Min. floor to ceiling height on ground floor is 12 ft if nonresidential' },
          { label: '', parameter: 'Accessory structure height (max)', value: '20 ft', notes: '' },
        ]
      }
    ]
  },
  '02-10': {
    title: 'Table 02-10: MN District Dimensional Standards',
    sections: [
      {
        name: 'Lot Dimensions (Minimum, only for lots created after the effective date)',
        rows: [
          { label: 'A', parameter: 'Lot area', value: '5,000 sq ft (0.115 acres)', notes: '' },
          { label: 'B', parameter: 'Lot width', value: '50 ft', notes: '' },
        ]
      },
      {
        name: 'Building Setbacks (Minimum)',
        rows: [
          { label: 'C', parameter: 'Front build-to range', value: '15 to 25 ft', notes: '' },
          { label: '', parameter: 'Front building facade at build-to range (min)', value: '70%', notes: '' },
          { label: 'D', parameter: 'Side', value: '7 ft', notes: 'Buildings abutting R1, R2, R3, or R4 must comply with §20.04.070(d)(5)' },
          { label: 'E', parameter: 'Rear', value: '10 ft', notes: 'Buildings abutting R1, R2, R3, or R4 must comply with §20.04.070(d)(5)' },
        ]
      },
      {
        name: 'Other Standards',
        rows: [
          { label: '', parameter: 'Front parking setback (min)', value: '20 ft behind primary structure\'s front building wall', notes: '' },
          { label: '', parameter: 'Impervious surface coverage (max)', value: '60%', notes: '' },
          { label: '', parameter: 'Landscape area (min)', value: '40%', notes: '' },
          { label: '', parameter: 'Area of individual commercial tenant (max)', value: '5,000 sq ft gross floor area', notes: '' },
          { label: 'F', parameter: 'Primary structure height (max)', value: '3 stories, not to exceed 40 ft', notes: 'Buildings abutting R1, R2, R3, or R4 must comply with §20.04.070(d)(5); Min. floor to ceiling height on ground floor is 12 ft if nonresidential; See §20.04.110 (Incentives)' },
          { label: '', parameter: 'Accessory structure height (max)', value: '20 ft', notes: '' },
        ]
      }
    ]
  },
  '02-11': {
    title: 'Table 02-11: MM District Dimensional Standards',
    sections: [
      {
        name: 'Lot Dimensions (Minimum, only for lots created after the effective date)',
        rows: [
          { label: 'A', parameter: 'Lot area', value: '5,000 sq ft (0.115 acres)', notes: '' },
          { label: 'B', parameter: 'Lot width', value: '50 ft', notes: '' },
        ]
      },
      {
        name: 'Building Setbacks (Minimum)',
        rows: [
          { label: 'C', parameter: 'Front build-to range', value: '15 to 25 ft', notes: '' },
          { label: '', parameter: 'Front building facade at build-to range (min)', value: '70%', notes: '' },
          { label: 'D', parameter: 'Side', value: '7 ft', notes: 'Buildings abutting R1, R2, R3, or R4 must comply with §20.04.070(d)(5)' },
          { label: 'E', parameter: 'Rear', value: '7 ft', notes: 'Buildings abutting R1, R2, R3, or R4 must comply with §20.04.070(d)(5)' },
        ]
      },
      {
        name: 'Other Standards',
        rows: [
          { label: 'F', parameter: 'Front parking setback (min)', value: '20 ft behind primary structure\'s front building wall', notes: '' },
          { label: '', parameter: 'Impervious surface coverage (max)', value: '60%', notes: '' },
          { label: '', parameter: 'Landscape area (min)', value: '40%', notes: '' },
          { label: 'G', parameter: 'Primary structure height (max)', value: '4 stories, not to exceed 50 ft', notes: 'Buildings abutting R1, R2, R3, or R4 must comply with §20.04.070(d)(5); Min. floor to ceiling height on ground floor is 12 ft if nonresidential; See §20.04.110 (Incentives)' },
          { label: '', parameter: 'Accessory structure height (max)', value: '30 ft', notes: '' },
        ]
      }
    ]
  },
  '02-12': {
    title: 'Table 02-12: MC District Dimensional Standards',
    sections: [
      {
        name: 'Lot Dimensions (Minimum, only for lots created after the effective date)',
        rows: [
          { label: 'A', parameter: 'Lot area', value: '5,000 sq ft (0.115 acres)', notes: '' },
          { label: 'B', parameter: 'Lot width', value: '50 ft', notes: '' },
        ]
      },
      {
        name: 'Building Setbacks (Minimum)',
        rows: [
          { label: 'C', parameter: 'Front', value: '15 ft', notes: '' },
          { label: 'D', parameter: 'Side', value: '7 ft', notes: 'Buildings abutting R1, R2, R3, or R4 must comply with §20.04.070(d)(5)' },
          { label: 'E', parameter: 'Rear', value: '7 ft', notes: 'Buildings abutting R1, R2, R3, or R4 must comply with §20.04.070(d)(5)' },
        ]
      },
      {
        name: 'Other Standards',
        rows: [
          { label: 'F', parameter: 'Front parking setback (min)', value: '20 ft behind primary structure\'s front building wall', notes: '' },
          { label: '', parameter: 'Impervious surface coverage (max)', value: '60%', notes: '' },
          { label: '', parameter: 'Landscape area (min)', value: '40%', notes: '' },
          { label: 'G', parameter: 'Primary structure height (max)', value: '4 stories, not to exceed 50 ft', notes: 'Buildings abutting R1, R2, R3, or R4 must comply with §20.04.070(d)(5); Min. floor to ceiling height on ground floor is 12 ft if nonresidential; See §20.04.110 (Incentives)' },
          { label: '', parameter: 'Accessory structure height (max)', value: '30 ft', notes: '' },
        ]
      }
    ]
  },
  '02-13': {
    title: 'Table 02-13: ME District Dimensional Standards',
    sections: [
      {
        name: 'Lot Dimensions (Minimum, only for lots created after the effective date)',
        rows: [
          { label: 'A', parameter: 'Lot area', value: '5,000 sq ft (0.115 acres)', notes: '' },
          { label: 'B', parameter: 'Lot width', value: '50 ft', notes: '' },
        ]
      },
      {
        name: 'Building Setbacks (Minimum)',
        rows: [
          { label: 'C', parameter: 'Front', value: '15 ft', notes: '' },
          { label: 'D', parameter: 'Side', value: '10 ft', notes: 'Buildings abutting R1, R2, R3, or R4 must comply with §20.04.070(d)(5)' },
          { label: 'E', parameter: 'Rear', value: '10 ft', notes: 'Buildings abutting R1, R2, R3, or R4 must comply with §20.04.070(d)(5)' },
        ]
      },
      {
        name: 'Other Standards',
        rows: [
          { label: 'F', parameter: 'Front parking setback (min)', value: '20 ft behind primary structure\'s front building wall', notes: '' },
          { label: '', parameter: 'Impervious surface coverage (max)', value: '70%', notes: '' },
          { label: '', parameter: 'Landscape area (min)', value: '30%', notes: '' },
          { label: 'G', parameter: 'Primary structure height (max)', value: '5 stories, not to exceed 63 ft', notes: 'Buildings abutting R1, R2, R3, or R4 must comply with §20.04.070(d)(5); Min. floor to ceiling height on ground floor is 12 ft if nonresidential; See §20.04.110 (Incentives)' },
          { label: '', parameter: 'Accessory structure height (max)', value: '30 ft', notes: '' },
        ]
      }
    ]
  },
  '02-14': {
    title: 'Table 02-14: MI District Dimensional Standards',
    sections: [
      {
        name: 'Lot Dimensions (Minimum, only for lots created after the effective date)',
        rows: [
          { label: 'A', parameter: 'Lot area', value: '5,000 sq ft (0.115 acres)', notes: '' },
          { label: 'B', parameter: 'Lot width', value: '50 ft', notes: '' },
        ]
      },
      {
        name: 'Building Setbacks (Minimum)',
        rows: [
          { label: 'C', parameter: 'Front', value: '15 ft', notes: '' },
          { label: 'D', parameter: 'Side', value: '10 ft', notes: 'Buildings abutting R1, R2, R3, or R4 must comply with §20.04.070(d)(5)' },
          { label: '', parameter: 'Rear', value: '10 ft', notes: 'Buildings abutting R1, R2, R3, or R4 must comply with §20.04.070(d)(5)' },
        ]
      },
      {
        name: 'Other Standards',
        rows: [
          { label: 'F', parameter: 'Front parking setback (min)', value: '20 ft behind primary structure\'s front building wall', notes: '' },
          { label: '', parameter: 'Impervious surface coverage (max)', value: '60%', notes: '' },
          { label: '', parameter: 'Landscape area (min)', value: '40%', notes: '' },
          { label: '', parameter: 'Primary structure height (max)', value: '4 stories, not to exceed 50 ft', notes: 'Buildings abutting R1, R2, R3, or R4 must comply with §20.04.070(d)(5); Min. floor to ceiling height on ground floor is 12 ft if nonresidential; See §20.04.110 (Incentives)' },
          { label: '', parameter: 'Accessory structure height (max)', value: '30 ft', notes: '' },
        ]
      }
    ]
  },
  '02-21': {
    title: 'Table 02-21: MH District Dimensional Standards',
    sections: [
      {
        name: 'Lot Dimensions (Minimum, only for lots created after the effective date)',
        rows: [
          { label: 'A', parameter: 'Lot area', value: '10,890 sq ft (0.250 acres)', notes: '' },
          { label: 'B', parameter: 'Lot width', value: '65 ft', notes: '' },
        ]
      },
      {
        name: 'Building Setbacks (Minimum)',
        rows: [
          { label: 'C', parameter: 'Front', value: '25 ft', notes: '' },
          { label: 'D', parameter: 'Side', value: '10 ft', notes: 'Buildings abutting R1, R2, R3, or R4 must comply with §20.04.070(d)(5)' },
          { label: 'E', parameter: 'Rear', value: '10 ft', notes: 'Buildings abutting R1, R2, R3, or R4 must comply with §20.04.070(d)(5)' },
        ]
      },
      {
        name: 'Other Standards',
        rows: [
          { label: '', parameter: 'Front parking setback (min)', value: '20 ft behind primary structure\'s front building wall', notes: '' },
          { label: '', parameter: 'Impervious surface coverage (max)', value: '60%', notes: '' },
          { label: '', parameter: 'Landscape area (min)', value: '40%', notes: '' },
          { label: 'F', parameter: 'Primary structure height (max)', value: '3 stories, not to exceed 40 ft', notes: 'Buildings abutting R1, R2, R3, or R4 must comply with §20.04.070(d)(5); Min. floor to ceiling height on ground floor is 12 ft if nonresidential; See §20.04.110 (Incentives)' },
          { label: '', parameter: 'Accessory structure height (max)', value: '25 ft', notes: '' },
        ]
      }
    ]
  },
  '02-22': {
    title: 'Table 02-22: EM District Dimensional Standards',
    sections: [
      {
        name: 'Lot Dimensions (Minimum, only for lots created after the effective date)',
        rows: [
          { label: 'A', parameter: 'Lot area', value: 'None', notes: '' },
          { label: 'B', parameter: 'Lot width', value: '100 ft', notes: '' },
        ]
      },
      {
        name: 'Building Setbacks (Minimum)',
        rows: [
          { label: 'C', parameter: 'Front', value: '25 ft', notes: '' },
          { label: 'D', parameter: 'Side', value: '20 ft', notes: 'When adjacent to R1, R2, R3, or R4, min. setback increased by 1 ft for each ft of building height over 30 ft' },
          { label: 'E', parameter: 'Rear', value: '20 ft', notes: 'When adjacent to R1, R2, R3, or R4, min. setback increased by 1 ft for each ft of building height over 30 ft' },
        ]
      },
      {
        name: 'Other Standards',
        rows: [
          { label: '', parameter: 'Front parking setback (min)', value: '20 ft behind primary structure\'s front building wall', notes: '' },
          { label: '', parameter: 'Impervious surface coverage (max)', value: '70%', notes: '' },
          { label: '', parameter: 'Landscape area (min)', value: '30%', notes: '' },
          { label: 'F', parameter: 'Primary structure height (max)', value: '4 stories, not to exceed 50 ft', notes: 'When adjacent to R1, R2, R3, or R4, min. setback increased by 1 ft for each ft of building height over 30 ft' },
          { label: '', parameter: 'Accessory structure height (max)', value: '35 ft', notes: '' },
        ]
      }
    ]
  },
  '02-23': {
    title: 'Table 02-23: PO District Dimensional Standards',
    sections: [
      {
        name: 'Lot Dimensions (Minimum, only for lots created after the effective date)',
        rows: [
          { label: 'A', parameter: 'Lot area', value: 'None', notes: '' },
          { label: 'B', parameter: 'Lot width', value: 'None', notes: '' },
        ]
      },
      {
        name: 'Building Setbacks (Minimum)',
        rows: [
          { label: 'C', parameter: 'Front setback', value: '15 ft', notes: '' },
          { label: 'D', parameter: 'Side setback', value: '5 ft', notes: '' },
          { label: 'E', parameter: 'Rear setback', value: '5 ft', notes: '' },
        ]
      },
      {
        name: 'Other Standards',
        rows: [
          { label: '', parameter: 'Front parking setback (min)', value: '15 ft', notes: '' },
          { label: '', parameter: 'Impervious surface coverage (max)', value: 'None', notes: '' },
          { label: 'F', parameter: 'Primary structure height (max)', value: '20 ft', notes: '' },
          { label: '', parameter: 'Accessory structure height (max)', value: '20 ft', notes: '' },
        ]
      }
    ]
  },
};

function generateNormalizedTable(ref: string): NormalizedTable {
  const data = OCR_DATA[ref];
  const pages = TABLE_PAGES[ref];
  
  if (!data || !pages) {
    throw new Error(`No data found for table ${ref}`);
  }
  
  const rows: NormalizedRow[] = [];
  let rowIndex = 0;
  
  for (const section of data.sections) {
    for (const row of section.rows) {
      const sourceText = `${row.label} ${row.parameter} ${row.value}${row.notes ? ` ${row.notes}` : ''}`;
      
      rows.push({
        source_row_index: rowIndex,
        label: row.label,
        parameter: row.parameter,
        value: row.value,
        notes: row.notes || undefined,
        is_inferred: false, // All data from OCR is manually verified
        is_header: false,
        page: pages[0],
        table_ref: ref,
        source_text: sourceText.trim()
      });
      
      rowIndex++;
    }
  }
  
  return {
    table_ref: ref,
    table_title: data.title,
    pages: pages,
    normalized_at: new Date().toISOString(),
    rows: rows
  };
}

function main() {
  const basePath = 'corpus/bloomington/2026-02-21/city_pdf/phase2_adu_tables/normalized';
  
  console.log('Updating dimensional standards tables from OCR data...\n');
  
  const refs = Object.keys(OCR_DATA).sort();
  let updated = 0;
  let errors = 0;
  
  for (const ref of refs) {
    try {
      console.log(`Processing ${ref}...`);
      
      const normalized = generateNormalizedTable(ref);
      
      // Write JSON
      const jsonPath = path.join(basePath, `table_${ref}_normalized.json`);
      fs.writeFileSync(jsonPath, JSON.stringify(normalized, null, 2), 'utf-8');
      console.log(`  ✓ Updated ${jsonPath}`);
      
      // Write JSONL
      const jsonlPath = path.join(basePath, `table_${ref}_rows.jsonl`);
      const rowLines = normalized.rows.map(row => JSON.stringify(row)).join('\n');
      fs.writeFileSync(jsonlPath, rowLines + '\n', 'utf-8');
      console.log(`  ✓ Updated ${jsonlPath}`);
      
      console.log(`  ${normalized.rows.length} rows`);
      
      updated++;
    } catch (error) {
      console.error(`  ✗ Error: ${error}`);
      errors++;
    }
  }
  
  console.log(`\n=== Summary ===`);
  console.log(`Updated: ${updated} tables`);
  console.log(`Errors: ${errors}`);
  
  if (errors > 0) {
    process.exit(1);
  }
}

main();