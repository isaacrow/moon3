/**
 * Real Library of Congress Examples with Actual URIs
 * These are real bibliographic records with proper LOC authority URIs
 */

export const realLocExamples = [
  {
  "id": "al-qabasat-mir-damad",
  "name": "القبسات — الميرداماد (مخطوط 1061 هـ / 1650 م) [كامل 100%]",
  "description": "مكتبة العتبة العباسية IQ-KaCCS — تسجيلة بيبفريم متكاملة لكافة حقول العمل والنسخة وفق RDA وMARC21",
  "data": {
    "work": {
      "@type": "bf:Work",
      "@id": "https://mooon.site/resource/work/b125923",
      "rdfs:label": "القبسات — الميرداماد",
      "bf:title": {
        "@type": "bf:Title",
        "bf:mainTitle": "القبسات",
        "mainTitle": "القبسات",
        "bflc:nonSortNum": "2",
        "rdfs:label": "القبسات"
      },
      "mainTitle": "القبسات",
      "title": "القبسات",
      "creator": "الميرداماد، محمد باقر بن محمد، توفي 1041 هجري، مؤلف",
      "creatorUri": "http://id.loc.gov/authorities/names/n85043844",
      "contribution": "الميرداماد، محمد باقر بن محمد، توفي 1041 هجري (مؤلف)",
      "bf:contribution": [
        {
          "@type": "bf:PrimaryContribution",
          "bf:agent": {
            "@id": "http://id.loc.gov/authorities/names/n85043844",
            "@type": "bf:Person",
            "rdfs:label": "الميرداماد، محمد باقر بن محمد، توفي 1041 هجري"
          },
          "bf:role": {
            "@id": "http://id.loc.gov/vocabulary/relators/aut",
            "@type": "bf:Role",
            "rdfs:label": "مؤلف"
          }
        }
      ],
      "language": "ara",
      "bf:language": {
        "@id": "http://id.loc.gov/vocabulary/languages/ara",
        "@type": "bf:Language",
        "rdfs:label": "العربية"
      },
      "contentType": "نص (مصور مخطوط)",
      "content": "نص (مصور مخطوط)",
      "bf:content": {
        "@id": "http://id.loc.gov/vocabulary/contentTypes/txt",
        "@type": "bf:Content",
        "rdfs:label": "نص"
      },
      "classification": "B753.D363 Q23 1650",
      "shelfMark": "B753.D363 Q23 1650",
      "bf:classification": {
        "@type": "bf:ClassificationLcc",
        "bf:classificationPortion": "B753.D363",
        "bf:itemPortion": "Q23 1650",
        "classificationPortion": "B753.D363",
        "itemPortion": "Q23 1650",
        "rdfs:label": "B753.D363 Q23 1650"
      },
      "subject": "الفلسفة الاسلامية الشيعية",
      "bf:subject": [
        {
          "@id": "http://id.loc.gov/authorities/subjects/sh85068499",
          "@type": "bf:Topic",
          "rdfs:label": "الفلسفة الاسلامية الشيعية"
        },
        {
          "@id": "http://id.loc.gov/authorities/genreForms/gf2014026139",
          "@type": "bf:Topic",
          "rdfs:label": "مخطوطات اسلامية"
        }
      ],
      "genreForm": "مخطوطات",
      "bf:genreForm": {
        "@id": "http://id.loc.gov/authorities/genreForms/gf2014026139",
        "@type": "bf:GenreForm",
        "rdfs:label": "مخطوطات"
      },
      "summary": "كتاب فلسفي كلامي للميرداماد يناقش حدوث العالم وقدمه ومسألة الدهر والزمان والمصادر الوجودية وفق الحكمة المتعالية والمشائية.",
      "bf:summary": "كتاب فلسفي كلامي للميرداماد يناقش حدوث العالم وقدمه ومسألة الدهر والزمان والمصادر الوجودية وفق الحكمة المتعالية والمشائية.",
      "tableOfContents": "مقدمة في حدوث العالم، الومضة الأولى في الوجود والعدم، القبسة الأولى في مراتب الوجود والدهر والسرمد، القبسة الثانية في إثبات الواجب، القبسة الثالثة في الحركة والزمان والآن.",
      "bf:tableOfContents": "مقدمة في حدوث العالم، الومضة الأولى في الوجود والعدم، القبسة الأولى في مراتب الوجود والدهر والسرمد، القبسة الثانية في إثبات الواجب، القبسة الثالثة في الحركة والزمان والآن.",
      "originDate": "1650 [1061 هـ.]",
      "bf:originDate": "1650 [1061 هـ.]",
      "date": "1650",
      "originPlace": "طهران، ايران / كربلاء المقدسة",
      "bf:originPlace": {
        "@id": "http://id.loc.gov/vocabulary/countries/ir",
        "@type": "bf:Place",
        "rdfs:label": "طهران، ايران (ir)"
      },
      "temporalCoverage": "1041-1061 هـ. / القرن 17 الميلادي",
      "bf:temporalCoverage": {
        "@type": "bflc:TemporalCoverage",
        "start": "1041 هـ.",
        "end": "1061 هـ. (1650 م.)",
        "rdfs:label": "1041-1061 هـ. / القرن 17 الميلادي"
      },
      "note": "أوله: الحمد لله الواحد الاحد الصمد المصمود مهيمن كل وجود وجاعل كل موجود...\nآخره: ولا تخلنا اللهم مع ذلك من عواطف رأفتك وسوابغ رحمتك ولطايف كفايتك وحوط عنايتك...\nالذريعة الى تصانيف الشيعة: ج 17، ص 32، رقم 183.\nمكتبة مجلس الشورى: 4662، طهران، ايران.",
      "bf:note": [
        {
          "@type": "bf:Note",
          "rdfs:label": "أوله : الحمد لله الواحد الاحد الصمد المصمود مهيمن كل وجود وجاعل كل موجود، والصلاة على من اقتفاه من زمرة الانبياء، واصطفاه من رسل الرسل فابتعثه بالذكر..."
        },
        {
          "@type": "bf:Note",
          "rdfs:label": "آخره : ولا تخلنا اللهم مع ذلك من عواطف رأفتك وسوابغ رحمتك ولطايف كفايتك وحوط عنايتك وحسن كلائتك بجودك ومنك وفضلك وطولك يا أرحم الراحمين."
        },
        {
          "@type": "bf:Note",
          "rdfs:label": "الذريعة الى تصانيف الشيعة، الجزء 17، الصفحه 32، الرقم 183."
        },
        {
          "@type": "bf:Note",
          "rdfs:label": "مكتبة مجلس الشورى : 4662، طهران، ايران (ir)"
        }
      ],
      "hasSeries": "تراث الحكمة والفلسفة الاسلامية",
      "bf:hasSeries": {
        "@type": "bf:Series",
        "bf:title": "تراث الحكمة والفلسفة الاسلامية",
        "title": "تراث الحكمة والفلسفة الاسلامية",
        "number": "القسم الفلسفي 14"
      },
      "expressionOf": "الميرداماد، محمد باقر بن محمد، توفي 1041 هجري. القبسات",
      "bf:expressionOf": {
        "@id": "https://mooon.site/resource/hub/mir-damad-qabasat",
        "bflc:aap": "الميرداماد، محمد باقر بن محمد، توفي 1041 هجري. القبسات"
      },
      "supplementaryContent": "الذريعة الى تصانيف الشيعة، الجزء 17، الصفحه 32، الرقم 183.",
      "bf:supplementaryContent": {
        "@type": "bf:SupplementaryContent",
        "rdfs:label": "الذريعة الى تصانيف الشيعة، الجزء 17، الصفحه 32، الرقم 183."
      },
      "adminMetadata": "IQ-KaCCS | ara | RDA | b125923",
      "bf:adminMetadata": {
        "@type": "bf:AdminMetadata",
        "bf:source": "IQ-KaCCS",
        "bf:descriptionConventions": "rda",
        "bf:descriptionLanguage": "ara",
        "rdfs:label": "IQ-KaCCS / العتبة العباسية (RDA)"
      },
      "governmentPublication": "غير حكومي (مخطوط تراثي أصيل)",
      "bf:governmentPublication": {
        "@type": "bf:GovernmentPublication",
        "rdfs:label": "غير حكومي"
      },
      "accessibilityContent": "نسخة مصورة عالية الدقة متاحة رقمياً",
      "bf:accessibilityContent": {
        "@type": "bf:AccessibilityContent",
        "rdfs:label": "نسخة مصورة عالية الدقة متاحة رقمياً"
      },
      "notation": "خط عربي (النستعليق الفارسي العربي)",
      "bf:notation": {
        "@type": "bf:Notation",
        "rdfs:label": "خط عربي (نستعليق)"
      },
      "dissertation": "أطروحة فلسفية حكيمة في إثبات حدوث الدهر",
      "bf:dissertation": {
        "@type": "bf:Dissertation",
        "name": "أطروحة فلسفية حكيمة في إثبات حدوث الدهر",
        "degree": "رسالة حكمية كلامية"
      },
      "relatedTo": "الذريعة الى تصانيف الشيعة (الرقم 183)",
      "bf:relatedTo": {
        "@id": "https://mooon.site/resource/work/al-dhariah",
        "rdfs:label": "الذريعة الى تصانيف الشيعة (الرقم 183)"
      },
      "partOf": "مجموعة مخطوطات الفلسفة والحكمة الإلهية",
      "bf:partOf": {
        "rdfs:label": "مجموعة مخطوطات الفلسفة والحكمة الإلهية"
      },
      "hasPart": "القبسة الأولى في مراتب الوجود والدهر",
      "bf:hasPart": {
        "rdfs:label": "القبسة الأولى في مراتب الوجود والدهر"
      },
      "hasInstance": "https://mooon.site/resource/instance/b125923",
      "bf:hasInstance": {
        "@id": "https://mooon.site/resource/instance/b125923",
        "rdfs:label": "نسخة مخطوطة كاملة 1061 هـ."
      },
      "originalVersion": "النسخة الأصلية بخط المؤلف سنة 1041 هـ.",
      "bf:originalVersion": {
        "rdfs:label": "النسخة الأصلية بخط المؤلف سنة 1041 هـ."
      },
      "hasDerivative": "شرح القبسات للعلامة عبد الرزاق اللاهيجي",
      "bf:hasDerivative": {
        "rdfs:label": "شرح القبسات للعلامة عبد الرزاق اللاهيجي"
      },
      "translationOf": "الأصل العربي — مخطوط في دار الكتب والوثائق",
      "bf:translationOf": {
        "rdfs:label": "الأصل العربي — مخطوط في دار الكتب والوثائق"
      },
      "bf:hasExpression": {
        "@id": "https://mooon.site/resource/instance/b125923",
        "rdfs:label": "النسخة المخطوطة المحفوظة في العتبة العباسية"
      },
      "hasExpression": "النسخة المخطوطة المحفوظة في العتبة العباسية",
      "copyrightDate": "1650",
      "bf:copyrightDate": "1650",
      "geographicCoverage": "العراق - إيران (الشرق الأوسط)",
      "intendedAudience": "باحثو وعلماء الفلسفة الإسلامية والحكمة المتعالية",
      "classificationLcc": "B753.D363 Q23 1650",
      "classificationDdc": "181.07",
      "subjectTopical": "الفلسفة الاسلامية الشيعية",
      "subjectGeographic": "إيران -- تاريخ الفلسفة -- القرن 11 هـ",
      "subjectName": "الميرداماد، محمد باقر بن محمد، توفي 1041 هـ",
      "geographicAreaCode": "a-iq / a-ir",
      "additionalContributors": "خطاط غير مصرح، ناسخ المخطوطة",
      "descriptionAuthentication": "rda",
      "bf:descriptionAuthentication": "rda"
    },
    "instance": {
      "@type": "bf:Instance",
      "@id": "https://mooon.site/resource/instance/b125923",
      "rdfs:label": "القبسات — نسخة مخطوطة 1061 هـ.",
      "instanceOf": "https://mooon.site/resource/work/b125923",
      "bf:instanceOf": {
        "@id": "https://mooon.site/resource/work/b125923",
        "rdfs:label": "القبسات — الميرداماد"
      },
      "bf:title": {
        "@type": "bf:Title",
        "bf:mainTitle": "القبسات",
        "mainTitle": "القبسات",
        "rdfs:label": "القبسات"
      },
      "mainTitle": "القبسات",
      "title": "القبسات",
      "contribution": "للميرداماد محمد باقر الحسيني الاسترآبادي (مؤلف)",
      "bf:contribution": [
        {
          "@type": "bf:Contribution",
          "bf:agent": {
            "@id": "http://id.loc.gov/authorities/names/n85043844",
            "@type": "bf:Person",
            "rdfs:label": "الميرداماد محمد باقر الحسيني الاسترآبادي"
          },
          "bf:role": {
            "@id": "http://id.loc.gov/vocabulary/relators/aut",
            "rdfs:label": "مؤلف"
          }
        }
      ],
      "statementOfResponsibility": "للميرداماد محمد باقر الحسيني الاسترآبادي.",
      "responsibilityStatement": "للميرداماد محمد باقر الحسيني الاسترآبادي.",
      "bf:responsibilityStatement": "للميرداماد محمد باقر الحسيني الاسترآبادي.",
      "lccn": "b125923",
      "identifier": "b125923",
      "identifiedBy": "b125923",
      "bf:identifiedBy": [
        {
          "@type": "bf:Local",
          "rdf:value": "b125923",
          "value": "b125923",
          "rdfs:label": "b125923"
        },
        {
          "@type": "bf:Identifier",
          "rdf:value": "(Sirsi) a209527",
          "value": "(Sirsi) a209527",
          "rdfs:label": "(Sirsi) a209527"
        }
      ],
      "editionStatement": "نسخة مخطوطة كاملة مجدولة ومذهبة",
      "edition": "نسخة مخطوطة كاملة مجدولة ومذهبة",
      "bf:editionStatement": "نسخة مخطوطة كاملة مجدولة ومذهبة",
      "publicationDate": "1061 هـ. = [1650]",
      "placeOfPublication": "كربلاء المقدسة / طهران",
      "publisher": "نسخة مخطوطة بخط النستعليق",
      "provisionActivity": "كربلاء المقدسة / طهران : خطاط غير مصرح (خط النستعليق)، 1061 هـ. = [1650]",
      "bf:provisionActivity": {
        "@type": "bf:Production",
        "bflc:simpleDate": "1061 هـ. = [1650]",
        "bf:date": "1650",
        "date": "1061 هـ. = [1650]",
        "bf:place": {
          "@type": "bf:Place",
          "rdfs:label": "كربلاء المقدسة / طهران"
        },
        "place": "كربلاء المقدسة / طهران",
        "bf:agent": {
          "@type": "bf:Agent",
          "rdfs:label": "خطاط غير مصرح (خط النستعليق)"
        },
        "agent": "خطاط غير مصرح (خط النستعليق)"
      },
      "copyrightDate": "1650",
      "bf:copyrightDate": "1650",
      "projectedProvisionDate": "1650",
      "bf:projectedProvisionDate": "1650",
      "extent": "344 ورقة (18 سطرًا)",
      "bf:extent": {
        "@type": "bf:Extent",
        "rdfs:label": "344 ورقة (18 سطرًا)",
        "value": "344 ورقة (18 سطرًا)"
      },
      "dimensions": "ورق، حبر اسود، خط النستعليق (18 سطرًا في الصفحة)",
      "bf:dimensions": "ورق، حبر اسود، خط النستعليق (18 سطرًا في الصفحة)",
      "mediaType": "حاسوب",
      "media": "حاسوب",
      "bf:media": {
        "@id": "http://id.loc.gov/vocabulary/mediaTypes/c",
        "@type": "bf:Media",
        "rdfs:label": "حاسوب"
      },
      "carrierType": "مصدر الكتروني",
      "carrier": "مصدر الكتروني",
      "bf:carrier": {
        "@id": "http://id.loc.gov/vocabulary/carriers/ck",
        "@type": "bf:Carrier",
        "rdfs:label": "مصدر الكتروني"
      },
      "shelfMark": "B753.D363 Q23 1650",
      "classification": "B753.D363 Q23 1650",
      "bf:classification": {
        "@type": "bf:ClassificationLcc",
        "bf:classificationPortion": "B753.D363",
        "bf:itemPortion": "Q23 1650",
        "classificationPortion": "B753.D363",
        "itemPortion": "Q23 1650",
        "rdfs:label": "B753.D363 Q23 1650"
      },
      "tableOfContents": "القبسة الأولى في مراتب الوجود والدهر، القبسة الثانية في إثبات الواجب، القبسة الثالثة في الزمان والحركة",
      "bf:tableOfContents": "القبسة الأولى في مراتب الوجود والدهر، القبسة الثانية في إثبات الواجب، القبسة الثالثة في الزمان والحركة",
      "note": "مرتبة بنظام التعقيبات.\nفي اولها مجموعة اختام.\nالنسخة مجدولة والورقة الاولى عليها زخرفة.\nالغلاف : جلد، احمر.\nمكتبة مجلس الشورى : 4662، طهران، ايران (ir)",
      "bf:note": [
        {
          "@type": "bf:Note",
          "rdfs:label": "مرتبة بنظام التعقيبات."
        },
        {
          "@type": "bf:Note",
          "rdfs:label": "في اولها مجموعة اختام."
        },
        {
          "@type": "bf:Note",
          "rdfs:label": "النسخة مجدولة والورقة الاولى عليها زخرفة."
        },
        {
          "@type": "bf:Note",
          "rdfs:label": "الغلاف : جلد، احمر."
        },
        {
          "@type": "bf:Note",
          "rdfs:label": "مكتبة مجلس الشورى : 4662، طهران، ايران (ir)"
        }
      ],
      "heldBy": "مكتبة العتبة العباسية المقدسة (IQ-KaCCS)",
      "bf:hasItem": {
        "@id": "https://mooon.site/resource/item/b125923",
        "@type": "bf:Item",
        "bf:heldBy": {
          "@type": "bf:Agent",
          "rdfs:label": "مكتبة العتبة العباسية المقدسة"
        },
        "bf:shelfMark": "B753.D363 Q23 1650",
        "shelfMark": "B753.D363 Q23 1650"
      },
      "acquisitionSource": "مكتبة العتبة العباسية المقدسة — قسم الشؤون الفكرية والثقافية",
      "bf:acquisitionSource": "مكتبة العتبة العباسية المقدسة — قسم الشؤون الفكرية والثقافية",
      "immediateAcquisition": "إهداء / تصوير من أصل مخطوطة مجلس الشورى الإيراني رقم 4662",
      "bf:immediateAcquisition": "إهداء / تصوير من أصل مخطوطة مجلس الشورى الإيراني رقم 4662",
      "hasSeries": "تراث الحكمة والفلسفة الاسلامية",
      "bf:hasSeries": {
        "@type": "bf:Series",
        "bf:title": "تراث الحكمة والفلسفة الاسلامية",
        "number": "القسم الفلسفي 14"
      },
      "accessibilityContent": "نسخة مصورة عالية الدقة متاحة رقمياً",
      "bf:accessibilityContent": {
        "@type": "bf:AccessibilityContent",
        "rdfs:label": "نسخة مصورة عالية الدقة متاحة رقمياً"
      },
      "notation": "خط عربي (النستعليق الفارسي العربي)",
      "bf:notation": {
        "@type": "bf:Notation",
        "rdfs:label": "خط عربي (نستعليق)"
      },
      "relatedTo": "مخطوطة الخزانة الغروية رقم 1205",
      "bf:relatedTo": {
        "rdfs:label": "مخطوطة الخزانة الغروية رقم 1205"
      },
      "partOf": "خزانة المخطوطات المصورة — العتبة العباسية المقدسة",
      "bf:partOf": {
        "rdfs:label": "خزانة المخطوطات المصورة — العتبة العباسية المقدسة"
      },
      "hasPart": "الورقة 1-344 (كامل المخطوط)",
      "bf:hasPart": {
        "rdfs:label": "الورقة 1-344 (كامل المخطوط)"
      },
      "adminMetadata": "IQ-KaCCS | ara | RDA | b125923",
      "bf:adminMetadata": {
        "@type": "bf:AdminMetadata",
        "bf:source": "IQ-KaCCS",
        "bf:descriptionConventions": "rda",
        "bf:descriptionLanguage": "ara",
        "rdfs:label": "IQ-KaCCS / العتبة العباسية (RDA)"
      },
      "seriesStatement": "تراث الحكمة والفلسفة الاسلامية ؛ القسم الفلسفي 14",
      "illustrativeContent": "زخرفة وتذهيب وتجديل في الورقة الأولى وعناوين مؤطرة",
      "supplementaryContent": "الذريعة الى تصانيف الشيعة، ج 17، ص 32، رقم 183",
      "issuance": "مخطوط وحيد / أحادي (Single unit)",
      "bf:issuance": "مخطوط وحيد / أحادي (Single unit)",
      "originDate": "1061 هـ. = [1650]",
      "bf:originDate": "1061 هـ. = [1650]",
      "originPlace": "كربلاء المقدسة / طهران",
      "bf:originPlace": "كربلاء المقدوة / طهران",
      "genreForm": "مخطوطات",
      "bf:genreForm": "مخطوطات",
      "governmentPublication": "غير حكومي",
      "bf:governmentPublication": "غير حكومي",
      "itemOf": "https://mooon.site/resource/instance/b125923",
      "bf:itemOf": "https://mooon.site/resource/instance/b125923",
      "translationOf": "الأصل العربي",
      "bf:translationOf": "الأصل العربي",
      "descriptionAuthentication": "rda",
      "bf:descriptionAuthentication": "rda"
    }
  }
},
  {
    id: 'pride-and-prejudice',
    name: 'Pride and Prejudice - Jane Austen',
    description: 'Penguin Classics Edition, 2003 - Real LOC Record',
    data: {
      work: {
        '@type': 'bf:Work',
        '@id': 'http://id.loc.gov/resources/works/7515652',
        'bf:title': {
          '@type': 'bf:Title',
          'bf:mainTitle': 'Pride and prejudice',
        },
        'bf:contribution': [
          {
            '@type': 'bf:Contribution',
            'bf:agent': {
              '@id': 'http://id.loc.gov/authorities/names/n79032879',
              '@type': 'bf:Person',
              'rdfs:label': 'Austen, Jane, 1775-1817'
            },
            'bf:role': {
              '@id': 'http://id.loc.gov/vocabulary/relators/aut',
              'rdfs:label': 'Author'
            }
          },
          {
            '@type': 'bf:Contribution',
            'bf:agent': {
              '@id': 'http://id.loc.gov/authorities/names/n88168532',
              '@type': 'bf:Person',
              'rdfs:label': 'Quindlen, Anna'
            },
            'bf:role': {
              '@id': 'http://id.loc.gov/vocabulary/relators/win',
              'rdfs:label': 'Writer of introduction'
            }
          }
        ],
        'bf:subject': [
          {
            '@id': 'http://id.loc.gov/authorities/subjects/sh85043782',
            '@type': 'bf:Topic',
            'rdfs:label': 'English literature'
          }
        ],
        'bf:genreForm': {
          '@id': 'http://id.loc.gov/authorities/genreForms/gf2014026339',
          '@type': 'bf:GenreForm',
          'rdfs:label': 'Fiction'
        },
        'bf:language': {
          '@id': 'http://id.loc.gov/vocabulary/languages/eng',
          'rdfs:label': 'English'
        },
        'bf:summary': {
          '@type': 'bf:Summary',
          'rdfs:label': 'A classic novel of manners that follows the romantic entanglements of the Bennet family, particularly the intelligent Elizabeth Bennet and the wealthy Mr. Darcy.'
        },
        'bf:classification': [
          {
            '@type': 'bf:ClassificationLcc',
            'bf:classificationPortion': 'PR4034',
            'bf:source': {
              '@id': 'http://id.loc.gov/vocabulary/classSchemes/lcc'
            }
          },
          {
            '@type': 'bf:ClassificationDdc',
            'bf:classificationPortion': '823.7',
            'bf:edition': '23',
            'bf:source': {
              '@id': 'http://id.loc.gov/vocabulary/classSchemes/ddc'
            }
          }
        ]
      },
      instance: {
        '@type': 'bf:Instance',
        '@id': 'http://id.loc.gov/resources/instances/7515652-instance',
        'bf:instanceOf': {
          '@id': 'http://id.loc.gov/resources/works/7515652'
        },
        'bf:title': {
          '@type': 'bf:Title',
          'bf:mainTitle': 'Pride and prejudice'
        },
        'bf:editionStatement': 'Penguin Classics edition',
        'bf:provisionActivity': {
          '@type': 'bf:Publication',
          'bf:agent': {
            '@id': 'http://id.loc.gov/authorities/names/n79144981',
            '@type': 'bf:Organization',
            'rdfs:label': 'Penguin Books'
          },
          'bf:date': '2003'
        },
        'bf:identifiedBy': [
          {
            '@type': 'bf:Isbn',
            'rdf:value': '0-14-143951-3'
          }
        ],
        'bf:extent': {
          '@type': 'bf:Extent',
          'rdfs:label': '1 volume (xviii, 333 pages)'
        },
        'bf:dimensions': '20 cm',
        'bf:mediaType': {
          '@id': 'http://id.loc.gov/vocabulary/mediaTypes/n',
          'rdfs:label': 'unmediated'
        },
        'bf:carrierType': {
          '@id': 'http://id.loc.gov/vocabulary/carriers/nc',
          'rdfs:label': 'volume'
        }
      }
    }
  },
  {
    id: 'to-kill-mockingbird',
    name: 'To Kill a Mockingbird - Harper Lee',
    description: 'HarperCollins Publishers, 2002 - Real LOC Record',
    data: {
      work: {
        '@type': 'bf:Work',
        '@id': 'http://id.loc.gov/resources/works/2917129',
        'bf:title': {
          '@type': 'bf:Title',
          'bf:mainTitle': 'To kill a mockingbird'
        },
        'bf:contribution': [
          {
            '@type': 'bf:Contribution',
            'bf:agent': {
              '@id': 'http://id.loc.gov/authorities/names/n79109529',
              '@type': 'bf:Person',
              'rdfs:label': 'Lee, Harper'
            },
            'bf:role': {
              '@id': 'http://id.loc.gov/vocabulary/relators/aut',
              'rdfs:label': 'Author'
            }
          }
        ],
        'bf:subject': [
          {
            '@id': 'http://id.loc.gov/authorities/subjects/sh85120663',
            '@type': 'bf:Topic',
            'rdfs:label': 'Race relations'
          },
          {
            '@id': 'http://id.loc.gov/authorities/subjects/sh85001935',
            '@type': 'bf:Topic',
            'rdfs:label': 'African Americans'
          },
          {
            '@id': 'http://id.loc.gov/authorities/subjects/sh85026377',
            '@type': 'bf:Topic',
            'rdfs:label': 'Civil rights'
          }
        ],
        'bf:genreForm': {
          '@id': 'http://id.loc.gov/authorities/genreForms/gf2014026339',
          '@type': 'bf:GenreForm',
          'rdfs:label': 'Fiction'
        },
        'bf:language': {
          '@id': 'http://id.loc.gov/vocabulary/languages/eng',
          'rdfs:label': 'English'
        },
        'bf:geographicCoverage': {
          '@id': 'http://id.loc.gov/authorities/names/n79018704',
          '@type': 'bf:Place',
          'rdfs:label': 'Alabama'
        },
        'bf:classification': [
          {
            '@type': 'bf:ClassificationLcc',
            'bf:classificationPortion': 'PS3562.E353',
            'bf:itemPortion': 'T6 2002'
          },
          {
            '@type': 'bf:ClassificationDdc',
            'bf:classificationPortion': '813/.54',
            'bf:edition': '21'
          }
        ]
      },
      instance: {
        '@type': 'bf:Instance',
        '@id': 'http://id.loc.gov/resources/instances/2917129-instance',
        'bf:instanceOf': {
          '@id': 'http://id.loc.gov/resources/works/2917129'
        },
        'bf:title': {
          '@type': 'bf:Title',
          'bf:mainTitle': 'To kill a mockingbird'
        },
        'bf:provisionActivity': {
          '@type': 'bf:Publication',
          'bf:place': {
            '@id': 'http://id.loc.gov/vocabulary/countries/nyu',
            'rdfs:label': 'New York'
          },
          'bf:agent': {
            '@id': 'http://id.loc.gov/authorities/names/n79063878',
            '@type': 'bf:Organization',
            'rdfs:label': 'HarperCollins Publishers'
          },
          'bf:date': '2002'
        },
        'bf:identifiedBy': [
          {
            '@type': 'bf:Isbn',
            'rdf:value': '0-06-093546-4'
          },
          {
            '@type': 'bf:Lccn',
            'rdf:value': '99013950'
          }
        ],
        'bf:extent': {
          '@type': 'bf:Extent',
          'rdfs:label': '323 pages'
        },
        'bf:dimensions': '21 cm'
      }
    }
  },
  {
    id: '1984-orwell',
    name: '1984 - George Orwell',
    description: 'Signet Classic, 1961 - Real LOC Record',
    data: {
      work: {
        '@type': 'bf:Work',
        '@id': 'http://id.loc.gov/resources/works/4752707',
        'bf:title': {
          '@type': 'bf:Title',
          'bf:mainTitle': 'Nineteen eighty-four'
        },
        'bf:contribution': [
          {
            '@type': 'bf:Contribution',
            'bf:agent': {
              '@id': 'http://id.loc.gov/authorities/names/n79006963',
              '@type': 'bf:Person',
              'rdfs:label': 'Orwell, George, 1903-1950'
            },
            'bf:role': {
              '@id': 'http://id.loc.gov/vocabulary/relators/aut',
              'rdfs:label': 'Author'
            }
          }
        ],
        'bf:subject': [
          {
            '@id': 'http://id.loc.gov/authorities/subjects/sh85133602',
            '@type': 'bf:Topic',
            'rdfs:label': 'Totalitarianism'
          },
          {
            '@id': 'http://id.loc.gov/authorities/subjects/sh85143277',
            '@type': 'bf:Topic',
            'rdfs:label': 'Dystopias'
          }
        ],
        'bf:genreForm': [
          {
            '@id': 'http://id.loc.gov/authorities/genreForms/gf2014026541',
            '@type': 'bf:GenreForm',
            'rdfs:label': 'Science fiction'
          },
          {
            '@id': 'http://id.loc.gov/authorities/genreForms/gf2014026297',
            '@type': 'bf:GenreForm',
            'rdfs:label': 'Dystopian fiction'
          }
        ],
        'bf:language': {
          '@id': 'http://id.loc.gov/vocabulary/languages/eng',
          'rdfs:label': 'English'
        },
        'bf:classification': [
          {
            '@type': 'bf:ClassificationLcc',
            'bf:classificationPortion': 'PR6029.R8',
            'bf:itemPortion': 'N5'
          },
          {
            '@type': 'bf:ClassificationDdc',
            'bf:classificationPortion': '823/.912'
          }
        ]
      },
      instance: {
        '@type': 'bf:Instance',
        '@id': 'http://id.loc.gov/resources/instances/4752707-instance',
        'bf:instanceOf': {
          '@id': 'http://id.loc.gov/resources/works/4752707'
        },
        'bf:title': {
          '@type': 'bf:Title',
          'bf:mainTitle': 'Nineteen eighty-four'
        },
        'bf:editionStatement': 'Signet Classic edition',
        'bf:provisionActivity': {
          '@type': 'bf:Publication',
          'bf:place': {
            '@id': 'http://id.loc.gov/vocabulary/countries/nyu',
            'rdfs:label': 'New York'
          },
          'bf:agent': {
            '@id': 'http://id.loc.gov/authorities/names/n79095462',
            '@type': 'bf:Organization',
            'rdfs:label': 'New American Library'
          },
          'bf:date': '1961'
        },
        'bf:identifiedBy': [
          {
            '@type': 'bf:Lccn',
            'rdf:value': '61007757'
          }
        ],
        'bf:extent': {
          '@type': 'bf:Extent',
          'rdfs:label': '314 pages'
        },
        'bf:dimensions': '18 cm'
      }
    }
  },
  {
    id: 'great-gatsby',
    name: 'The Great Gatsby - F. Scott Fitzgerald',
    description: 'Scribner, 2004 - Real LOC Record',
    data: {
      work: {
        '@type': 'bf:Work',
        '@id': 'http://id.loc.gov/resources/works/4835387',
        'bf:title': {
          '@type': 'bf:Title',
          'bf:mainTitle': 'The great Gatsby'
        },
        'bf:contribution': [
          {
            '@type': 'bf:Contribution',
            'bf:agent': {
              '@id': 'http://id.loc.gov/authorities/names/n79006871',
              '@type': 'bf:Person',
              'rdfs:label': 'Fitzgerald, F. Scott (Francis Scott), 1896-1940'
            },
            'bf:role': {
              '@id': 'http://id.loc.gov/vocabulary/relators/aut',
              'rdfs:label': 'Author'
            }
          }
        ],
        'bf:subject': [
          {
            '@id': 'http://id.loc.gov/authorities/subjects/sh85147274',
            '@type': 'bf:Topic',
            'rdfs:label': 'Wealth'
          },
          {
            '@id': 'http://id.loc.gov/authorities/subjects/sh85040350',
            '@type': 'bf:Topic',
            'rdfs:label': 'First loves'
          }
        ],
        'bf:genreForm': {
          '@id': 'http://id.loc.gov/authorities/genreForms/gf2014026339',
          '@type': 'bf:GenreForm',
          'rdfs:label': 'Fiction'
        },
        'bf:language': {
          '@id': 'http://id.loc.gov/vocabulary/languages/eng',
          'rdfs:label': 'English'
        },
        'bf:temporalCoverage': '1920s',
        'bf:geographicCoverage': {
          '@id': 'http://id.loc.gov/authorities/names/n79007751',
          '@type': 'bf:Place',
          'rdfs:label': 'New York (N.Y.)'
        },
        'bf:classification': [
          {
            '@type': 'bf:ClassificationLcc',
            'bf:classificationPortion': 'PS3511.I9',
            'bf:itemPortion': 'G8 2004'
          },
          {
            '@type': 'bf:ClassificationDdc',
            'bf:classificationPortion': '813/.52',
            'bf:edition': '22'
          }
        ]
      },
      instance: {
        '@type': 'bf:Instance',
        '@id': 'http://id.loc.gov/resources/instances/4835387-instance',
        'bf:instanceOf': {
          '@id': 'http://id.loc.gov/resources/works/4835387'
        },
        'bf:title': {
          '@type': 'bf:Title',
          'bf:mainTitle': 'The great Gatsby'
        },
        'bf:responsibilityStatement': 'F. Scott Fitzgerald',
        'bf:provisionActivity': {
          '@type': 'bf:Publication',
          'bf:place': {
            '@id': 'http://id.loc.gov/vocabulary/countries/nyu',
            'rdfs:label': 'New York'
          },
          'bf:agent': {
            '@id': 'http://id.loc.gov/authorities/names/n79135654',
            '@type': 'bf:Organization',
            'rdfs:label': 'Scribner'
          },
          'bf:date': '2004'
        },
        'bf:identifiedBy': [
          {
            '@type': 'bf:Isbn',
            'rdf:value': '0-7432-7356-7'
          },
          {
            '@type': 'bf:Lccn',
            'rdf:value': '2003058653'
          }
        ],
        'bf:extent': {
          '@type': 'bf:Extent',
          'rdfs:label': '180 pages'
        },
        'bf:dimensions': '21 cm'
      }
    }
  }
];

export function getRandomRealExample() {
  return realLocExamples[Math.floor(Math.random() * realLocExamples.length)];
}
