type PreferenceQuestionRecord = {
  id: string;
  key: string;
  text: string;
};

export type PreferenceQuestionDto = {
  id: string;
  key: string;
  text: string;
};

export function toPreferenceQuestionDto(
  question: PreferenceQuestionRecord,
): PreferenceQuestionDto {
  return { id: question.id, key: question.key, text: question.text };
}
