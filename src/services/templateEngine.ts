/**
 * BIBFRAME Template Engine
 * Defines cataloging templates for different resource types
 * Supports dynamic form generation
 */


export interface TemplateField {
  property: string; // Short name (e.g., 'bf:title')
  required?: boolean;
  repeatable?: boolean;
  defaultValue?: any;
  helpText?: string;
  customValidation?: (value: any) => boolean;
}

export interface TemplateSection {
  title: string;
  description?: string;
  fields: TemplateField[];
  collapsible?: boolean;
  defaultExpanded?: boolean;
}

export interface CatalogingTemplate {
  id: string;
  name: string;
  description: string;
  resourceType: string;
  icon?: string;
  entities: {
    work?: TemplateSection[];
    expression?: TemplateSection[];
    instance?: TemplateSection[];
    item?: TemplateSection[];
    adminMetadata?: TemplateSection[];
  };
  enableExpression?: boolean;
  enableRelationships?: boolean;
}

/**
 * MONOGRAPH COMPLETE TEMPLATE
 * 100+ fields for comprehensive book cataloging
 */
export const MONOGRAPH_COMPLETE_TEMPLATE: CatalogingTemplate = {
  id: 'monograph-complete',
  name: 'Monograph (Complete)',
  description: 'Comprehensive template for books and monographic publications',
  resourceType: 'http://id.loc.gov/ontologies/bibframe/Text',
  icon: 'BookOpen',
  enableExpression: true,
  enableRelationships: true,
  entities: {
    work: [
      {
        title: 'Title Information',
        description: 'Main and variant titles',
        fields: [
          { property: 'bf:title', required: true, repeatable: true },
          { property: 'bf:variantTitle', repeatable: true },
          { property: 'bf:abbreviatedTitle', repeatable: true }
        ],
        defaultExpanded: true
      },
      {
        title: 'Contributors',
        description: 'Authors, editors, translators, and other contributors',
        fields: [
          { property: 'bf:contribution', required: true, repeatable: true }
        ],
        defaultExpanded: true
      },
      {
        title: 'Language & Content Type',
        fields: [
          { property: 'bf:language', repeatable: true },
          { property: 'bf:originalLanguage' },
          { property: 'bf:content' }
        ],
        defaultExpanded: true
      },
      {
        title: 'Subject Access',
        description: 'Subjects, classification, and genre',
        fields: [
          { property: 'bf:subject', repeatable: true },
          { property: 'bf:classification', repeatable: true },
          { property: 'bf:genreForm', repeatable: true },
          { property: 'bf:geographicCoverage', repeatable: true },
          { property: 'bf:temporalCoverage', repeatable: true }
        ],
        defaultExpanded: false
      },
      {
        title: 'Content Description',
        fields: [
          { property: 'bf:summary', repeatable: true },
          { property: 'bf:tableOfContents' },
          { property: 'bf:illustrativeContent', repeatable: true },
          { property: 'bf:supplementaryContent', repeatable: true }
        ],
        defaultExpanded: false
      },
      {
        title: 'Audience & Awards',
        fields: [
          { property: 'bf:intendedAudience', repeatable: true },
          { property: 'bf:awards', repeatable: true }
        ],
        defaultExpanded: false
      },
      {
        title: 'Work Dates',
        fields: [
          { property: 'bf:originDate' }
        ],
        defaultExpanded: false
      },
      {
        title: 'Relationships',
        description: 'Related works and parts',
        fields: [
          { property: 'bf:relatedTo', repeatable: true },
          { property: 'bf:hasPart', repeatable: true },
          { property: 'bf:partOf' },
          { property: 'bf:precededBy' },
          { property: 'bf:succeededBy' }
        ],
        defaultExpanded: false
      }
    ],
    expression: [
      {
        title: 'Expression Properties',
        description: 'Language and form-specific properties',
        fields: [
          { property: 'bf:expressionOf', required: true },
          { property: 'bf:language', repeatable: true },
          { property: 'bf:contribution', repeatable: true },
          { property: 'bf:translationOf' }
        ],
        defaultExpanded: true
      }
    ],
    instance: [
      {
        title: 'Basic Instance Information',
        fields: [
          { property: 'bf:instanceOf', required: true },
          { property: 'bf:title', required: true },
          { property: 'bf:editionStatement' },
          { property: 'bf:responsibilityStatement' }
        ],
        defaultExpanded: true
      },
      {
        title: 'Identifiers',
        description: 'ISBN, LCCN, and other standard identifiers',
        fields: [
          { property: 'bf:identifiedBy', repeatable: true }
        ],
        defaultExpanded: true
      },
      {
        title: 'Publication Information',
        description: 'Publisher, place, and date',
        fields: [
          { property: 'bf:provisionActivity', required: true, repeatable: true },
          { property: 'bf:copyrightDate' }
        ],
        defaultExpanded: true
      },
      {
        title: 'Physical Description',
        description: 'Extent, dimensions, carrier, and media',
        fields: [
          { property: 'bf:extent' },
          { property: 'bf:dimensions' },
          { property: 'bf:carrier', required: true },
          { property: 'bf:media', required: true }
        ],
        defaultExpanded: true
      },
      {
        title: 'Series Information',
        fields: [
          { property: 'bf:seriesStatement', repeatable: true },
          { property: 'bf:seriesEnumeration' }
        ],
        defaultExpanded: false
      },
      {
        title: 'Content Notes',
        fields: [
          { property: 'bf:tableOfContents' },
          { property: 'bf:supplementaryContent', repeatable: true },
          { property: 'bf:note', repeatable: true }
        ],
        defaultExpanded: false
      },
      {
        title: 'Acquisition & Issuance',
        fields: [
          { property: 'bf:issuance' },
          { property: 'bf:acquisitionSource' }
        ],
        defaultExpanded: false
      },
      {
        title: 'Instance Relationships',
        fields: [
          { property: 'bf:hasEquivalent', repeatable: true },
          { property: 'bf:accompaniedBy', repeatable: true },
          { property: 'bf:precededBy' },
          { property: 'bf:succeededBy' }
        ],
        defaultExpanded: false
      }
    ],
    item: [
      {
        title: 'Holdings Information',
        description: 'Physical item and location',
        fields: [
          { property: 'bf:itemOf', required: true },
          { property: 'bf:heldBy' },
          { property: 'bf:shelfMark' },
          { property: 'bf:subLocation' },
          { property: 'bf:identifiedBy', repeatable: true }
        ],
        defaultExpanded: true
      },
      {
        title: 'Electronic Access',
        fields: [
          { property: 'bf:electronicLocator', repeatable: true }
        ],
        defaultExpanded: false
      },
      {
        title: 'Access & Status',
        fields: [
          { property: 'bf:usageAndAccessPolicy', repeatable: true },
          { property: 'bf:status' }
        ],
        defaultExpanded: false
      },
      {
        title: 'Acquisition',
        fields: [
          { property: 'bf:immediateAcquisition' },
          { property: 'bf:acquisitionSource' }
        ],
        defaultExpanded: false
      },
      {
        title: 'Notes',
        fields: [
          { property: 'bf:note', repeatable: true }
        ],
        defaultExpanded: false
      }
    ],
    adminMetadata: [
      {
        title: 'Administrative Metadata',
        description: 'Record management information',
        fields: [
          { property: 'bf:creationDate' },
          { property: 'bf:changeDate' },
          { property: 'bf:source' },
          { property: 'bf:descriptionConventions' },
          { property: 'bf:descriptionLanguage' },
          { property: 'bf:descriptionAuthentication' }
        ],
        defaultExpanded: true
      }
    ]
  }
};

/**
 * SERIAL TEMPLATE
 * For journals, magazines, newspapers
 */
export const SERIAL_TEMPLATE: CatalogingTemplate = {
  id: 'serial',
  name: 'Serial',
  description: 'Template for continuing resources (journals, magazines, newspapers)',
  resourceType: 'http://id.loc.gov/ontologies/bibframe/Serial',
  icon: 'Newspaper',
  enableExpression: false,
  enableRelationships: true,
  entities: {
    work: [
      {
        title: 'Title Information',
        fields: [
          { property: 'bf:title', required: true },
          { property: 'bf:variantTitle', repeatable: true }
        ],
        defaultExpanded: true
      },
      {
        title: 'Contributors',
        fields: [
          { property: 'bf:contribution', repeatable: true }
        ],
        defaultExpanded: true
      },
      {
        title: 'Language & Subject',
        fields: [
          { property: 'bf:language', repeatable: true },
          { property: 'bf:subject', repeatable: true },
          { property: 'bf:classification', repeatable: true }
        ],
        defaultExpanded: true
      }
    ],
    instance: [
      {
        title: 'Basic Information',
        fields: [
          { property: 'bf:instanceOf', required: true },
          { property: 'bf:title', required: true }
        ],
        defaultExpanded: true
      },
      {
        title: 'Identifiers',
        fields: [
          { property: 'bf:identifiedBy', repeatable: true }
        ],
        defaultExpanded: true
      },
      {
        title: 'Publication',
        fields: [
          { property: 'bf:provisionActivity', required: true },
          { property: 'bf:frequency' },
          { property: 'bf:issuance' }
        ],
        defaultExpanded: true
      },
      {
        title: 'Serial Relationships',
        fields: [
          { property: 'bf:precededBy' },
          { property: 'bf:succeededBy' }
        ],
        defaultExpanded: false
      }
    ],
    item: [
      {
        title: 'Holdings',
        fields: [
          { property: 'bf:itemOf', required: true },
          { property: 'bf:heldBy' },
          { property: 'bf:shelfMark' }
        ],
        defaultExpanded: true
      }
    ]
  }
};

/**
 * MANUSCRIPT TEMPLATE
 * For archival and unique materials
 */
export const MANUSCRIPT_TEMPLATE: CatalogingTemplate = {
  id: 'manuscript',
  name: 'Manuscript',
  description: 'Template for manuscripts and archival materials',
  resourceType: 'http://id.loc.gov/ontologies/bibframe/Manuscript',
  icon: 'FileText',
  enableExpression: false,
  enableRelationships: true,
  entities: {
    work: [
      {
        title: 'Title',
        fields: [
          { property: 'bf:title', required: true }
        ],
        defaultExpanded: true
      },
      {
        title: 'Creators',
        fields: [
          { property: 'bf:contribution', repeatable: true }
        ],
        defaultExpanded: true
      },
      {
        title: 'Subject & Classification',
        fields: [
          { property: 'bf:subject', repeatable: true },
          { property: 'bf:geographicCoverage', repeatable: true },
          { property: 'bf:temporalCoverage', repeatable: true }
        ],
        defaultExpanded: true
      },
      {
        title: 'Content',
        fields: [
          { property: 'bf:summary', repeatable: true },
          { property: 'bf:originDate' }
        ],
        defaultExpanded: false
      }
    ],
    instance: [
      {
        title: 'Instance Information',
        fields: [
          { property: 'bf:instanceOf', required: true },
          { property: 'bf:extent' },
          { property: 'bf:dimensions' },
          { property: 'bf:carrier' }
        ],
        defaultExpanded: true
      },
      {
        title: 'Notes',
        fields: [
          { property: 'bf:note', repeatable: true }
        ],
        defaultExpanded: true
      }
    ],
    item: [
      {
        title: 'Location',
        fields: [
          { property: 'bf:itemOf', required: true },
          { property: 'bf:heldBy' },
          { property: 'bf:shelfMark' },
          { property: 'bf:subLocation' }
        ],
        defaultExpanded: true
      },
      {
        title: 'Access',
        fields: [
          { property: 'bf:usageAndAccessPolicy', repeatable: true }
        ],
        defaultExpanded: true
      }
    ]
  }
};

/**
 * MUSIC TEMPLATE
 * For musical scores and recordings
 */
export const MUSIC_TEMPLATE: CatalogingTemplate = {
  id: 'music',
  name: 'Music',
  description: 'Template for musical works and recordings',
  resourceType: 'http://id.loc.gov/ontologies/bibframe/MusicAudio',
  icon: 'Music',
  enableExpression: true,
  enableRelationships: true,
  entities: {
    work: [
      {
        title: 'Title',
        fields: [
          { property: 'bf:title', required: true },
          { property: 'bf:variantTitle', repeatable: true }
        ],
        defaultExpanded: true
      },
      {
        title: 'Contributors',
        fields: [
          { property: 'bf:contribution', required: true, repeatable: true }
        ],
        defaultExpanded: true
      },
      {
        title: 'Music Properties',
        fields: [
          { property: 'bf:musicMedium', repeatable: true },
          { property: 'bf:musicKey' }
        ],
        defaultExpanded: true
      },
      {
        title: 'Subject & Genre',
        fields: [
          { property: 'bf:subject', repeatable: true },
          { property: 'bf:genreForm', repeatable: true }
        ],
        defaultExpanded: false
      }
    ],
    instance: [
      {
        title: 'Instance',
        fields: [
          { property: 'bf:instanceOf', required: true },
          { property: 'bf:identifiedBy', repeatable: true },
          { property: 'bf:provisionActivity', required: true },
          { property: 'bf:carrier' },
          { property: 'bf:media' }
        ],
        defaultExpanded: true
      }
    ],
    item: [
      {
        title: 'Holdings',
        fields: [
          { property: 'bf:itemOf', required: true },
          { property: 'bf:heldBy' },
          { property: 'bf:shelfMark' }
        ],
        defaultExpanded: true
      }
    ]
  }
};

/**
 * MAP TEMPLATE
 * For cartographic materials
 */
export const MAP_TEMPLATE: CatalogingTemplate = {
  id: 'map',
  name: 'Cartographic Material',
  description: 'Template for maps and atlases',
  resourceType: 'http://id.loc.gov/ontologies/bibframe/Cartography',
  icon: 'Map',
  enableExpression: false,
  enableRelationships: true,
  entities: {
    work: [
      {
        title: 'Title',
        fields: [
          { property: 'bf:title', required: true }
        ],
        defaultExpanded: true
      },
      {
        title: 'Contributors',
        fields: [
          { property: 'bf:contribution', repeatable: true }
        ],
        defaultExpanded: true
      },
      {
        title: 'Geographic Coverage',
        fields: [
          { property: 'bf:geographicCoverage', repeatable: true },
          { property: 'bf:temporalCoverage', repeatable: true }
        ],
        defaultExpanded: true
      },
      {
        title: 'Subject',
        fields: [
          { property: 'bf:subject', repeatable: true },
          { property: 'bf:classification', repeatable: true }
        ],
        defaultExpanded: false
      }
    ],
    instance: [
      {
        title: 'Instance',
        fields: [
          { property: 'bf:instanceOf', required: true },
          { property: 'bf:provisionActivity', required: true },
          { property: 'bf:dimensions' },
          { property: 'bf:carrier' }
        ],
        defaultExpanded: true
      }
    ],
    item: [
      {
        title: 'Holdings',
        fields: [
          { property: 'bf:itemOf', required: true },
          { property: 'bf:heldBy' },
          { property: 'bf:shelfMark' }
        ],
        defaultExpanded: true
      }
    ]
  }
};

/**
 * STILL IMAGE TEMPLATE
 * Pictures, photographs, posters and postage stamps (Technical services > New record > Picture / Postage stamp)
 */
export const STILL_IMAGE_TEMPLATE: CatalogingTemplate = {
  id: 'still-image',
  name: 'Picture / Stamp',
  description: 'Template for pictures, photographs, posters and postage stamps',
  resourceType: 'http://id.loc.gov/ontologies/bibframe/StillImage',
  icon: 'Image',
  enableExpression: false,
  enableRelationships: true,
  entities: {
    work: [
      { title: 'Title', fields: [{ property: 'bf:title', required: true }], defaultExpanded: true },
      { title: 'Creators', fields: [{ property: 'bf:contribution', repeatable: true }], defaultExpanded: true },
      {
        title: 'Subject and form',
        fields: [
          { property: 'bf:subject', repeatable: true },
          { property: 'bf:genreForm', repeatable: true },
          { property: 'bf:geographicCoverage', repeatable: true },
          { property: 'bf:temporalCoverage', repeatable: true }
        ],
        defaultExpanded: true
      }
    ],
    instance: [
      {
        title: 'Instance',
        fields: [
          { property: 'bf:instanceOf', required: true },
          { property: 'bf:provisionActivity' },
          { property: 'bf:extent' },
          { property: 'bf:dimensions' },
          { property: 'bf:baseMaterial' },
          { property: 'bf:colorContent' },
          { property: 'bf:carrier' },
          { property: 'bf:note', repeatable: true }
        ],
        defaultExpanded: true
      }
    ],
    item: [
      { title: 'Holdings', fields: [{ property: 'bf:itemOf', required: true }, { property: 'bf:heldBy' }, { property: 'bf:shelfMark' }], defaultExpanded: true }
    ]
  }
};

/**
 * Template Registry
 */
export const TEMPLATE_REGISTRY: Record<string, CatalogingTemplate> = {
  'monograph-complete': MONOGRAPH_COMPLETE_TEMPLATE,
  'serial': SERIAL_TEMPLATE,
  'manuscript': MANUSCRIPT_TEMPLATE,
  'music': MUSIC_TEMPLATE,
  'map': MAP_TEMPLATE,
  'still-image': STILL_IMAGE_TEMPLATE
};

/**
 * Get template by ID
 */
export function getTemplate(id: string): CatalogingTemplate | undefined {
  return TEMPLATE_REGISTRY[id];
}

/**
 * Get all templates
 */
export function getAllTemplates(): CatalogingTemplate[] {
  return Object.values(TEMPLATE_REGISTRY);
}

/**
 * Get template names
 */
export function getTemplateNames(): Array<{ id: string; name: string; description: string }> {
  return getAllTemplates().map(t => ({
    id: t.id,
    name: t.name,
    description: t.description
  }));
}
