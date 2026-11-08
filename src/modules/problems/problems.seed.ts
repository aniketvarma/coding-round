import { Logger } from '@nestjs/common';
import postgres from 'postgres';
import { envSchema } from '../../platform/config/env.schema.js';
import type { Difficulty, Language } from './problems.dto.js';

type SeedProblem = {
  slug: string;
  title: string;
  difficulty: Difficulty;
  description: string;
  languages: {
    language: Language;
    starterCode: string;
    referenceSolution: string;
  }[];
};

const lines = (...text: string[]): string => text.join('\n');

const seedProblems: SeedProblem[] = [
  {
    slug: 'two-sum',
    title: 'Two Sum',
    difficulty: 'easy',
    description: lines(
      'Given an array of integers `nums` and an integer `target`, return the indices of the two numbers that add up to `target`.',
      '',
      'Each input has exactly one solution, and you may not use the same element twice. Return the answer in any order.',
      '',
      '**Example 1**',
      '',
      '    Input: nums = [2,7,11,15], target = 9',
      '    Output: [0,1]',
      '',
      '**Example 2**',
      '',
      '    Input: nums = [3,2,4], target = 6',
      '    Output: [1,2]',
      '',
      '**Constraints**',
      '',
      '- `2 <= nums.length <= 10^4`',
      '- `-10^9 <= nums[i] <= 10^9`',
    ),
    languages: [
      {
        language: 'javascript',
        starterCode: lines(
          '/**',
          ' * @param {number[]} nums',
          ' * @param {number} target',
          ' * @return {number[]}',
          ' */',
          'function twoSum(nums, target) {',
          '',
          '}',
        ),
        referenceSolution: lines(
          'function twoSum(nums, target) {',
          '  const seen = new Map();',
          '  for (let i = 0; i < nums.length; i++) {',
          '    const complement = target - nums[i];',
          '    if (seen.has(complement)) return [seen.get(complement), i];',
          '    seen.set(nums[i], i);',
          '  }',
          '  return [];',
          '}',
        ),
      },
      {
        language: 'python',
        starterCode: lines(
          'class Solution:',
          '    def twoSum(self, nums: list[int], target: int) -> list[int]:',
          '        pass',
        ),
        referenceSolution: lines(
          'class Solution:',
          '    def twoSum(self, nums: list[int], target: int) -> list[int]:',
          '        seen = {}',
          '        for i, num in enumerate(nums):',
          '            if target - num in seen:',
          '                return [seen[target - num], i]',
          '            seen[num] = i',
          '        return []',
        ),
      },
    ],
  },
  {
    slug: 'valid-parentheses',
    title: 'Valid Parentheses',
    difficulty: 'easy',
    description: lines(
      'Given a string `s` containing only the characters `(`, `)`, `{`, `}`, `[` and `]`, determine whether it is valid.',
      '',
      'A string is valid when every open bracket is closed by the same type of bracket, in the correct order.',
      '',
      '**Example 1**',
      '',
      '    Input: s = "()[]{}"',
      '    Output: true',
      '',
      '**Example 2**',
      '',
      '    Input: s = "(]"',
      '    Output: false',
      '',
      '**Constraints**',
      '',
      '- `1 <= s.length <= 10^4`',
    ),
    languages: [
      {
        language: 'javascript',
        starterCode: lines(
          '/**',
          ' * @param {string} s',
          ' * @return {boolean}',
          ' */',
          'function isValid(s) {',
          '',
          '}',
        ),
        referenceSolution: lines(
          'function isValid(s) {',
          "  const pairs = { ')': '(', ']': '[', '}': '{' };",
          '  const stack = [];',
          '  for (const char of s) {',
          '    if (char in pairs) {',
          '      if (stack.pop() !== pairs[char]) return false;',
          '    } else {',
          '      stack.push(char);',
          '    }',
          '  }',
          '  return stack.length === 0;',
          '}',
        ),
      },
      {
        language: 'python',
        starterCode: lines(
          'class Solution:',
          '    def isValid(self, s: str) -> bool:',
          '        pass',
        ),
        referenceSolution: lines(
          'class Solution:',
          '    def isValid(self, s: str) -> bool:',
          '        pairs = {")": "(", "]": "[", "}": "{"}',
          '        stack = []',
          '        for char in s:',
          '            if char in pairs:',
          '                if not stack or stack.pop() != pairs[char]:',
          '                    return False',
          '            else:',
          '                stack.append(char)',
          '        return not stack',
        ),
      },
    ],
  },
];

const logger = new Logger('Seed');
const env = envSchema.parse(process.env);
const sql = postgres(env.DATABASE_URL);

try {
  for (const { languages, ...problem } of seedProblems) {
    // One transaction per problem, so a failure can't leave a problem without its languages.
    await sql.begin(async (sql) => {
      // The ::difficulty and ::language casts are for SafeQL, which treats these parameters as text.
      const [row] = await sql<{ id: number }[]>`
        INSERT INTO problems (slug, title, difficulty, description)
        VALUES (${problem.slug}, ${problem.title}, ${problem.difficulty}::difficulty, ${problem.description})
        ON CONFLICT (slug) DO UPDATE
        SET title = EXCLUDED.title,
            difficulty = EXCLUDED.difficulty,
            description = EXCLUDED.description,
            updated_at = now()
        RETURNING id
      `;

      for (const language of languages) {
        await sql`
          INSERT INTO problem_languages (problem_id, language, starter_code, reference_solution)
          VALUES (${row.id}, ${language.language}::language, ${language.starterCode}, ${language.referenceSolution})
          ON CONFLICT (problem_id, language) DO UPDATE
          SET starter_code = EXCLUDED.starter_code,
              reference_solution = EXCLUDED.reference_solution
        `;
      }
    });
  }
  logger.log(`Seeded ${seedProblems.length} problems.`);
} finally {
  await sql.end();
}
