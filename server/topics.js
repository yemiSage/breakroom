import { GameError } from './game.js';
import { questions } from './questions.js';

// Ready-made quizzes the host can pick from "Use sample quiz".
export const topics = [
  { id: 'general', name: 'General knowledge', icon: '🌍', questions: [
    ...questions,
    { category: 'Food & drink', text: 'Jollof rice is a popular dish across which region?', options: ['West Africa', 'East Asia', 'South America', 'Northern Europe'], correct: 0, fact: 'Nigeria and Ghana have a famous friendly rivalry over whose jollof is best.' },
    { category: 'Calendar', text: 'How many days are in a leap year?', options: ['364', '365', '366', '367'], correct: 2, fact: 'February gets an extra day, the 29th, about every four years.' }
  ] },
  { id: 'maths', name: 'Maths', icon: '➗', questions: [
    { category: 'Maths', text: 'What is 15% of 200?', options: ['20', '25', '30', '35'], correct: 2, fact: '10% of 200 is 20 and 5% is 10, so 15% is 30.' },
    { category: 'Maths', text: 'What is the next prime number after 13?', options: ['15', '17', '19', '21'], correct: 1, fact: '15 is 3 × 5, but 17 has no factors other than 1 and itself.' },
    { category: 'Maths', text: 'What do the interior angles of a triangle add up to?', options: ['90°', '180°', '270°', '360°'], correct: 1, fact: 'Every flat triangle’s three angles add up to 180°.' },
    { category: 'Maths', text: 'What is 7 × 8?', options: ['54', '56', '63', '64'], correct: 1, fact: 'A handy memory trick: 5, 6, 7, 8 — 56 = 7 × 8.' },
    { category: 'Maths', text: 'What is the square root of 144?', options: ['11', '12', '13', '14'], correct: 1, fact: '12 × 12 = 144, which is also called a gross.' },
    { category: 'Maths', text: 'Which fraction is equal to 0.75?', options: ['1/4', '2/3', '3/4', '4/5'], correct: 2, fact: 'Three quarters is 3 ÷ 4, which is 0.75.' },
    { category: 'Maths', text: 'How many sides does a hexagon have?', options: ['5', '6', '7', '8'], correct: 1, fact: 'Honeybees build their honeycomb cells as hexagons.' },
    { category: 'Maths', text: 'If x + 7 = 12, what is x?', options: ['4', '5', '6', '19'], correct: 1, fact: 'Subtract 7 from both sides: x = 12 − 7 = 5.' },
    { category: 'Maths', text: 'What is 2 to the power of 5?', options: ['10', '16', '25', '32'], correct: 3, fact: '2 × 2 × 2 × 2 × 2 = 32.' },
    { category: 'Maths', text: 'What is the perimeter of a square with 6 cm sides?', options: ['12 cm', '18 cm', '24 cm', '36 cm'], correct: 2, fact: 'A square has four equal sides, so 4 × 6 = 24 cm.' }
  ] },
  { id: 'economics', name: 'Economics', icon: '📈', questions: [
    { category: 'Economics', text: 'What does GDP stand for?', options: ['Gross Domestic Product', 'General Domestic Price', 'Gross Daily Profit', 'Global Development Plan'], correct: 0, fact: 'GDP measures the value of all goods and services a country produces in a period.' },
    { category: 'Economics', text: 'What is a general rise in prices over time called?', options: ['Deflation', 'Inflation', 'Recession', 'Devaluation'], correct: 1, fact: 'Inflation means each unit of money buys a little less than before.' },
    { category: 'Economics', text: 'What is the currency of Japan?', options: ['Won', 'Yuan', 'Yen', 'Ringgit'], correct: 2, fact: 'The won is South Korea’s currency and the yuan is China’s.' },
    { category: 'Economics', text: 'If demand rises while supply stays the same, prices usually…', options: ['Fall', 'Rise', 'Stay fixed', 'Disappear'], correct: 1, fact: 'More buyers competing for the same goods pushes prices up.' },
    { category: 'Economics', text: 'Which body sets interest rates in the United States?', options: ['The Treasury', 'The Federal Reserve', 'Wall Street', 'The IMF'], correct: 1, fact: 'The Federal Reserve sets a target range for its key interest rate.' },
    { category: 'Economics', text: 'What is a market with only one seller called?', options: ['Oligopoly', 'Monopoly', 'Monopsony', 'Duopoly'], correct: 1, fact: 'A monopsony is the opposite: a market with only one buyer.' },
    { category: 'Economics', text: 'Who wrote “The Wealth of Nations”?', options: ['Adam Smith', 'John Maynard Keynes', 'Karl Marx', 'Milton Friedman'], correct: 0, fact: 'Adam Smith published it in 1776.' },
    { category: 'Economics', text: 'Two quarters in a row of shrinking GDP is a common sign of what?', options: ['A boom', 'A recession', 'A bubble', 'A recovery'], correct: 1, fact: 'Many economists use this rule of thumb, though official definitions vary.' },
    { category: 'Economics', text: 'What is the money a government has borrowed and not yet repaid called?', options: ['Public debt', 'Tax revenue', 'Trade surplus', 'Subsidy'], correct: 0, fact: 'Governments often borrow by selling bonds to investors.' },
    { category: 'Economics', text: 'What is the value of a country’s exports minus its imports called?', options: ['Exchange rate', 'Balance of trade', 'Inflation rate', 'Budget deficit'], correct: 1, fact: 'When exports are worth more than imports, a country has a trade surplus.' }
  ] },
  { id: 'english', name: 'English', icon: '📚', questions: [
    { category: 'English', text: 'Which word means the same as “happy”?', options: ['Gloomy', 'Joyful', 'Tired', 'Angry'], correct: 1, fact: 'Words with the same meaning are called synonyms.' },
    { category: 'English', text: 'What is the plural of “mouse” when it means the animal?', options: ['Mouses', 'Mice', 'Meese', 'Mouse'], correct: 1, fact: 'Mouse and mice follow the same pattern as louse and lice.' },
    { category: 'English', text: 'Which of these words is a verb?', options: ['Quickly', 'Beautiful', 'Run', 'Table'], correct: 2, fact: 'A verb names an action or a state, like run, think or be.' },
    { category: 'English', text: 'Which sentence is correct?', options: ['Their going to the park.', 'They’re going to the park.', 'There going to the park.', 'Theyre going to the park.'], correct: 1, fact: '“They’re” is short for “they are”.' },
    { category: 'English', text: 'What is the opposite of “ancient”?', options: ['Old', 'Modern', 'Historic', 'Antique'], correct: 1, fact: 'Words with opposite meanings are called antonyms.' },
    { category: 'English', text: 'Which word is spelled correctly?', options: ['Recieve', 'Receive', 'Receeve', 'Recive'], correct: 1, fact: 'Remember the rhyme: “i before e, except after c”.' },
    { category: 'English', text: 'What is a word that sounds like another but has a different meaning?', options: ['Synonym', 'Antonym', 'Homophone', 'Acronym'], correct: 2, fact: 'Pairs like “sea” and “see” or “flour” and “flower” are homophones.' },
    { category: 'English', text: 'Who wrote “Romeo and Juliet”?', options: ['Charles Dickens', 'William Shakespeare', 'Jane Austen', 'Mark Twain'], correct: 1, fact: 'Shakespeare wrote the play in the 1590s.' },
    { category: 'English', text: 'Which punctuation mark ends a question?', options: ['Full stop', 'Comma', 'Question mark', 'Colon'], correct: 2, fact: 'Spanish also opens questions with an upside-down question mark.' },
    { category: 'English', text: 'Which word is the adjective in “The tall man smiled”?', options: ['The', 'Tall', 'Man', 'Smiled'], correct: 1, fact: 'Adjectives describe nouns. Here, “tall” describes the man.' }
  ] },
  { id: 'animals', name: 'Animals', icon: '🐘', questions: [
    { category: 'Animals', text: 'What is the fastest land animal?', options: ['Lion', 'Cheetah', 'Pronghorn', 'Greyhound'], correct: 1, fact: 'Cheetahs can reach about 100 km/h in short bursts.' },
    { category: 'Animals', text: 'Which is the largest animal alive today?', options: ['African elephant', 'Blue whale', 'Giraffe', 'Whale shark'], correct: 1, fact: 'Blue whales can grow longer than 25 metres.' },
    { category: 'Animals', text: 'How many legs does a spider have?', options: ['6', '8', '10', '12'], correct: 1, fact: 'Spiders are arachnids, not insects, which have six legs.' },
    { category: 'Animals', text: 'Which mammal can truly fly?', options: ['Flying squirrel', 'Bat', 'Sugar glider', 'Colugo'], correct: 1, fact: 'The others glide. Bats are the only mammals that flap their wings to fly.' },
    { category: 'Animals', text: 'What is a group of lions called?', options: ['A pack', 'A herd', 'A pride', 'A flock'], correct: 2, fact: 'A pride is usually a few related females, their cubs and a few males.' },
    { category: 'Animals', text: 'Which animal is called the “ship of the desert”?', options: ['Horse', 'Camel', 'Elephant', 'Ostrich'], correct: 1, fact: 'Camels can go days without drinking and carry heavy loads across sand.' },
    { category: 'Animals', text: 'What do giant pandas mainly eat?', options: ['Fish', 'Bamboo', 'Insects', 'Fruit'], correct: 1, fact: 'Bamboo makes up almost all of a giant panda’s diet.' },
    { category: 'Animals', text: 'Which flightless bird is an expert swimmer?', options: ['Ostrich', 'Penguin', 'Kiwi', 'Emu'], correct: 1, fact: 'Penguins use their wings as flippers to “fly” underwater.' },
    { category: 'Animals', text: 'What is a baby kangaroo called?', options: ['Cub', 'Joey', 'Kid', 'Calf'], correct: 1, fact: 'A newborn joey is tiny and keeps growing inside its mother’s pouch.' },
    { category: 'Animals', text: 'Which is the tallest animal in the world?', options: ['Elephant', 'Giraffe', 'Camel', 'Ostrich'], correct: 1, fact: 'Adult giraffes can stand more than 5 metres tall.' }
  ] },
  { id: 'science', name: 'Science', icon: '🔬', questions: [
    { category: 'Science', text: 'What is the chemical symbol for gold?', options: ['Go', 'Gd', 'Au', 'Ag'], correct: 2, fact: 'Au comes from aurum, the Latin word for gold. Ag is silver.' },
    { category: 'Science', text: 'Which planet is known as the Red Planet?', options: ['Venus', 'Mars', 'Jupiter', 'Mercury'], correct: 1, fact: 'Iron oxide, or rust, in its soil gives Mars its red colour.' },
    { category: 'Science', text: 'What is the common name for H₂O?', options: ['Salt', 'Water', 'Hydrogen peroxide', 'Ammonia'], correct: 1, fact: 'Each water molecule has two hydrogen atoms and one oxygen atom.' },
    { category: 'Science', text: 'Which part of a plant does most of its photosynthesis?', options: ['Roots', 'Leaves', 'Stem', 'Flowers'], correct: 1, fact: 'Leaves are packed with chlorophyll, which captures sunlight.' },
    { category: 'Science', text: 'Which force keeps us on the ground?', options: ['Magnetism', 'Friction', 'Gravity', 'Inertia'], correct: 2, fact: 'Gravity pulls every mass towards every other mass.' },
    { category: 'Science', text: 'How many bones are in the adult human body?', options: ['186', '206', '226', '306'], correct: 1, fact: 'Babies have more, about 300, and some fuse together as they grow.' },
    { category: 'Science', text: 'At sea level, water boils at what temperature?', options: ['90°C', '100°C', '110°C', '120°C'], correct: 1, fact: 'Higher up, the air pressure is lower and water boils at a lower temperature.' },
    { category: 'Science', text: 'What is the hardest natural substance?', options: ['Gold', 'Iron', 'Diamond', 'Quartz'], correct: 2, fact: 'Diamond is a form of pure carbon with tightly bonded atoms.' },
    { category: 'Science', text: 'Which gas do plants take from the air to make their food?', options: ['Oxygen', 'Nitrogen', 'Carbon dioxide', 'Hydrogen'], correct: 2, fact: 'Plants release oxygen as a by-product of photosynthesis.' },
    { category: 'Science', text: 'What is the centre of an atom called?', options: ['Electron', 'Nucleus', 'Molecule', 'Shell'], correct: 1, fact: 'The nucleus holds protons and neutrons, and electrons move around it.' }
  ] },
  { id: 'geography', name: 'Geography', icon: '🗺️', questions: [
    { category: 'Geography', text: 'What is the capital of Australia?', options: ['Sydney', 'Melbourne', 'Canberra', 'Perth'], correct: 2, fact: 'Canberra was built as a compromise between Sydney and Melbourne.' },
    { category: 'Geography', text: 'What is the longest river in Africa?', options: ['Congo', 'Niger', 'Nile', 'Zambezi'], correct: 2, fact: 'The Nile flows north for more than 6,600 km into the Mediterranean.' },
    { category: 'Geography', text: 'What is the largest ocean?', options: ['Atlantic', 'Indian', 'Arctic', 'Pacific'], correct: 3, fact: 'The Pacific covers more area than all of Earth’s land put together.' },
    { category: 'Geography', text: 'Mount Kilimanjaro is in which country?', options: ['Kenya', 'Tanzania', 'Uganda', 'Ethiopia'], correct: 1, fact: 'At about 5,895 metres, it is the highest mountain in Africa.' },
    { category: 'Geography', text: 'What is the capital of Nigeria?', options: ['Lagos', 'Abuja', 'Kano', 'Ibadan'], correct: 1, fact: 'Abuja replaced Lagos as the capital in 1991.' },
    { category: 'Geography', text: 'Which continent has the most countries?', options: ['Asia', 'Europe', 'Africa', 'South America'], correct: 2, fact: 'Africa has 54 countries.' },
    { category: 'Geography', text: 'What is the largest hot desert in the world?', options: ['Gobi', 'Kalahari', 'Sahara', 'Arabian'], correct: 2, fact: 'The Sahara covers much of North Africa.' },
    { category: 'Geography', text: 'Which of these countries lies in both Europe and Asia?', options: ['Türkiye', 'Greece', 'Egypt', 'Iran'], correct: 0, fact: 'The Bosporus strait in Istanbul divides the European and Asian sides.' },
    { category: 'Geography', text: 'What is the capital of Ghana?', options: ['Kumasi', 'Accra', 'Tamale', 'Cape Coast'], correct: 1, fact: 'Accra sits on the coast of the Gulf of Guinea.' },
    { category: 'Geography', text: 'Which is the smallest continent by area?', options: ['Europe', 'Antarctica', 'Australia', 'South America'], correct: 2, fact: 'Australia is often called the island continent.' }
  ] },
  { id: 'history', name: 'History', icon: '🏛️', questions: [
    { category: 'History', text: 'In which year did World War II end?', options: ['1943', '1944', '1945', '1946'], correct: 2, fact: 'The war ended in Europe in May 1945 and in Asia that September.' },
    { category: 'History', text: 'Who was the first person to walk on the Moon?', options: ['Buzz Aldrin', 'Neil Armstrong', 'Yuri Gagarin', 'Michael Collins'], correct: 1, fact: 'Neil Armstrong stepped onto the Moon in July 1969.' },
    { category: 'History', text: 'Which ancient civilization built the pyramids of Giza?', options: ['Romans', 'Greeks', 'Egyptians', 'Persians'], correct: 2, fact: 'The Great Pyramid is more than 4,500 years old.' },
    { category: 'History', text: 'In which year did Nigeria gain independence?', options: ['1957', '1960', '1963', '1966'], correct: 1, fact: 'Nigeria became independent on 1 October 1960 and a republic in 1963.' },
    { category: 'History', text: 'Who was the first President of the United States?', options: ['Thomas Jefferson', 'Abraham Lincoln', 'George Washington', 'John Adams'], correct: 2, fact: 'George Washington took office in 1789.' },
    { category: 'History', text: 'In which year did the Berlin Wall fall?', options: ['1987', '1989', '1991', '1993'], correct: 1, fact: 'The wall opened on 9 November 1989. Germany reunified in 1990.' },
    { category: 'History', text: 'Who was the first president of South Africa elected in a fully democratic vote?', options: ['Thabo Mbeki', 'Nelson Mandela', 'Jacob Zuma', 'F. W. de Klerk'], correct: 1, fact: 'Nelson Mandela took office in 1994.' },
    { category: 'History', text: 'Mansa Musa ruled which West African empire?', options: ['Ghana Empire', 'Mali Empire', 'Songhai Empire', 'Oyo Empire'], correct: 1, fact: 'His pilgrimage to Mecca in 1324 made Mali famous for its gold.' },
    { category: 'History', text: 'Who was Nigeria’s first Prime Minister?', options: ['Nnamdi Azikiwe', 'Abubakar Tafawa Balewa', 'Obafemi Awolowo', 'Ahmadu Bello'], correct: 1, fact: 'Nnamdi Azikiwe became the first President when Nigeria became a republic in 1963.' },
    { category: 'History', text: 'In which year did the Titanic sink?', options: ['1905', '1912', '1918', '1921'], correct: 1, fact: 'It sank on its first voyage in April 1912 after hitting an iceberg.' }
  ] },
  { id: 'sports', name: 'Sports', icon: '⚽', questions: [
    { category: 'Sports', text: 'How many players does each football (soccer) team have on the pitch?', options: ['9', '10', '11', '12'], correct: 2, fact: 'Each team fields ten outfield players and a goalkeeper.' },
    { category: 'Sports', text: 'Which country has won the most men’s FIFA World Cups?', options: ['Germany', 'Italy', 'Brazil', 'Argentina'], correct: 2, fact: 'Brazil has won the tournament five times.' },
    { category: 'Sports', text: 'In tennis, what is a score of zero called?', options: ['Nil', 'Love', 'Duck', 'Blank'], correct: 1, fact: 'A score of zero in cricket is called a duck.' },
    { category: 'Sports', text: 'How many rings are on the Olympic flag?', options: ['4', '5', '6', '7'], correct: 1, fact: 'The five rings stand for the five inhabited continents taking part.' },
    { category: 'Sports', text: 'In which sport would you see a slam dunk?', options: ['Volleyball', 'Basketball', 'Handball', 'Netball'], correct: 1, fact: 'A slam dunk is when a player forces the ball down through the hoop.' },
    { category: 'Sports', text: 'How long is a marathon?', options: ['21.1 km', '35 km', '42.195 km', '50 km'], correct: 2, fact: 'The distance was fixed at 42.195 km in 1921.' },
    { category: 'Sports', text: 'In cricket, how many balls are in a standard over?', options: ['4', '5', '6', '8'], correct: 2, fact: 'Some countries once used eight-ball overs, but six is now standard.' },
    { category: 'Sports', text: 'Which country hosted the 2010 FIFA World Cup?', options: ['Brazil', 'Germany', 'South Africa', 'Nigeria'], correct: 2, fact: 'It was the first World Cup held in Africa.' },
    { category: 'Sports', text: 'How many players does each basketball team have on court?', options: ['4', '5', '6', '7'], correct: 1, fact: 'Each team has five players on court at a time.' },
    { category: 'Sports', text: 'Which country has won the most Africa Cup of Nations titles?', options: ['Nigeria', 'Cameroon', 'Egypt', 'Ghana'], correct: 2, fact: 'Egypt has won the tournament more times than any other country.' }
  ] },
  { id: 'technology', name: 'Technology', icon: '💻', questions: [
    { category: 'Technology', text: 'What does CPU stand for?', options: ['Central Processing Unit', 'Computer Personal Unit', 'Central Program Utility', 'Core Power Unit'], correct: 0, fact: 'The CPU carries out the instructions that make programs run.' },
    { category: 'Technology', text: 'What does URL stand for?', options: ['Uniform Resource Locator', 'Universal Remote Link', 'User Reference Line', 'Unified Resource Library'], correct: 0, fact: 'A URL is the address of a page or file on the web.' },
    { category: 'Technology', text: 'Which company makes the iPhone?', options: ['Samsung', 'Apple', 'Google', 'Nokia'], correct: 1, fact: 'Apple released the first iPhone in 2007.' },
    { category: 'Technology', text: 'How many bits are in a byte?', options: ['4', '8', '16', '32'], correct: 1, fact: 'One byte can store 256 different values.' },
    { category: 'Technology', text: 'What does HTTP stand for?', options: ['HyperText Transfer Protocol', 'High Transfer Text Process', 'Hyperlink Text Transport Program', 'Home Tool Transfer Protocol'], correct: 0, fact: 'HTTPS is the secure, encrypted version.' },
    { category: 'Technology', text: 'Which of these is a programming language?', options: ['HTML', 'Python', 'JPEG', 'USB'], correct: 1, fact: 'HTML describes web pages, but it is a markup language, not a programming language.' },
    { category: 'Technology', text: 'What does AI stand for?', options: ['Automated Internet', 'Artificial Intelligence', 'Advanced Interface', 'Analog Input'], correct: 1, fact: 'The term was coined for a workshop at Dartmouth College in 1956.' },
    { category: 'Technology', text: 'Which shortcut copies selected text on Windows?', options: ['Ctrl+V', 'Ctrl+X', 'Ctrl+C', 'Ctrl+Z'], correct: 2, fact: 'On a Mac, the same shortcut is Cmd+C.' },
    { category: 'Technology', text: 'What does RAM stand for?', options: ['Random Access Memory', 'Read Always Memory', 'Rapid Action Module', 'Remote Access Machine'], correct: 0, fact: 'RAM holds the data your computer is working on right now.' },
    { category: 'Technology', text: 'Which of these is a web browser?', options: ['Windows', 'Chrome', 'Excel', 'Android'], correct: 1, fact: 'Other browsers include Safari, Firefox and Edge.' }
  ] }
];

export const topicList = topics.map(({ id, name, icon }) => ({ id, name, icon }));

export function topicQuestions(id) {
  const topic = topics.find(entry => entry.id === id);
  if (!topic) throw new GameError(404, 'Choose a sample quiz topic.');
  return topic.questions;
}
