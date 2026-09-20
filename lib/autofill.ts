export const SHARED_AUTOFILL_KEYS = [
  "gender",
  "workAuthorization",
  "requiresSponsorship",
  "disabilityStatus",
  "veteranStatus",
  "hispanicLatino",
  "over18",
  "willingToRelocate",
  "willingToTravel",
  "earliestStartDate",
  "noticePeriod",
  "howHeard",
  "yearsOfExperience",
  "securityClearance",
  "raceEthnicity",
] as const;

export const DEFAULT_AUTOFILL = {
  gender: "Male",
  workAuthorization: "Yes",
  requiresSponsorship: "No",
  disabilityStatus: "No, I do not have a disability",
  veteranStatus: "I am not a protected veteran",
  hispanicLatino: "No",
  over18: "Yes",
  willingToRelocate: "No",
  willingToTravel: "Yes",
  earliestStartDate: "2 weeks",
  noticePeriod: "2 weeks",
  howHeard: "LinkedIn",
  yearsOfExperience: "8",
  securityClearance: "None",
  raceEthnicity: "",
};

export const DEFAULT_BIDDER_PREFS = {
  afkMode: false,
  autoSubmit: false,
  captchaAssist: true,
  waitForOtp: true,
};
