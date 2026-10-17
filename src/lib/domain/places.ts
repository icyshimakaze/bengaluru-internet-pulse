import rawGazetteer from "./gazetteer.json";
export const neighborhoods = ["Whitefield","Indiranagar","Koramangala","Hebbal","Electronic City","Yelahanka","Jayanagar","Marathahalli","HSR Layout","MG Road","Malleshwaram","Rajajinagar","Basavanagudi","Banashankari","JP Nagar","BTM Layout","Bellandur","Sarjapur Road","Sarjapur","Domlur","Ulsoor","Frazer Town","Cox Town","Richmond Town","Cooke Town","Benson Town","Shivajinagar","Vasanth Nagar","Sadashivanagar","Seshadripuram","Majestic","Gandhinagar","Chamrajpet","Vijayanagar","Nagarbhavi","Kengeri","Kumaraswamy Layout","Padmanabhanagar","Uttarahalli","Girinagar","Hanumanth Nagar","Vidyaranyapura","Sahakar Nagar","Sanjay Nagar","RT Nagar","Ganganagar","Mathikere","Yeshwanthpur","Jalahalli","Peenya","Dasarahalli","Nagasandra","Hesaraghatta","Doddaballapur","Bagalur","Thanisandra","Hennur","Horamavu","Banaswadi","Kammanahalli","Kalyan Nagar","Ramamurthy Nagar","KR Puram","Kasturi Nagar","CV Raman Nagar","Baiyappanahalli","Benniganahalli","Mahadevapura","Doddanekundi","Brookefield","Kundalahalli","AECS Layout","Varthur","Gunjur","Kadugodi","Belathur","Channasandra","Hoodi","ITPL","Panathur","Balagere","Kadubeesanahalli","Devarabisanahalli","Kaikondrahalli","Kasavanahalli","Harlur","Kudlu","Singasandra","Begur","Bommanahalli","Hongasandra","Garvebhavi Palya","Hosur Road","Chandapura","Anekal","Attibele","Jigani","Bommasandra","Bannerghatta","Gottigere","Hulimavu","Arekere","Bilekahalli","Dollars Colony","Wilson Garden","Shanti Nagar","Langford Town","Austin Town","Neelasandra","Adugodi","Ejipura","Vivek Nagar","Victoria Layout","Ashok Nagar","Cubbon Park","Church Street","Residency Road","Cunningham Road","Infantry Road","Kasturba Road","Richmond Road","Race Course Road","Lavelle Road","New BEL Road","Devanahalli","Jakkur","Amruthahalli","Kodigehalli","Byatarayanapura","Sampigehalli","Nagavara","Manyata Tech Park","Chikkabanavara","Soladevanahalli","Rajanukunte","Yelahanka New Town","Kamakshipalya","Basaveshwaranagar","Laggere","Nandini Layout"] as const;
export type PlaceName = typeof neighborhoods[number];
export const gazetteer = rawGazetteer;
// OSM locality centers only; missing/ambiguous coordinates stay off every map.
export const coordinates: Readonly<Partial<Record<PlaceName, readonly [number, number]>>> = {
  "Indiranagar": [
    12.9732913,
    77.6404672
  ],
  "Koramangala": [
    12.9357366,
    77.624081
  ],
  "Hebbal": [
    13.0382184,
    77.5919
  ],
  "Yelahanka": [
    13.1006982,
    77.5963454
  ],
  "Jayanagar": [
    12.9292731,
    77.5824229
  ],
  "Marathahalli": [
    12.9552572,
    77.6984163
  ],
  "HSR Layout": [
    12.9116225,
    77.6388622
  ],
  "Whitefield": [
    12.9696365,
    77.7497448
  ],
  "Electronic City": [
    12.8436448,
    77.6686835
  ]
};
