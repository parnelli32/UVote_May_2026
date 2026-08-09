export type DemographicsAnswers = {
  race_ethnicity: string;
  hispanic_latino: string;
  education: string;
  annual_earnings: string;
  homeownership: string;
  age_bracket: string;
  employment_status: string;
  veteran: string;
  disability: string;
  household_type: string;
};

export const EMPTY_DEMOGRAPHICS_ANSWERS: DemographicsAnswers = {
  race_ethnicity: '',
  hispanic_latino: '',
  education: '',
  annual_earnings: '',
  homeownership: '',
  age_bracket: '',
  employment_status: '',
  veteran: '',
  disability: '',
  household_type: '',
};

export function demographicsAnswersToRpcArgs(answers: DemographicsAnswers) {
  return {
    p_race_ethnicity: answers.race_ethnicity || null,
    p_hispanic_latino: answers.hispanic_latino ? answers.hispanic_latino === 'true' : null,
    p_education: answers.education || null,
    p_annual_earnings: answers.annual_earnings || null,
    p_homeownership: answers.homeownership || null,
    p_age_bracket: answers.age_bracket || null,
    p_employment_status: answers.employment_status || null,
    p_veteran: answers.veteran ? answers.veteran === 'true' : null,
    p_disability: answers.disability ? answers.disability === 'true' : null,
    p_household_type: answers.household_type || null,
  };
}
