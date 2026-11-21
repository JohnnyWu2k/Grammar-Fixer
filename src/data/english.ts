// Original, deliberately small vocabulary. Unknown words are not automatically errors.
// This project-authored data is distributed under the repository's MIT license.
export const COMMON_WORDS = `
the of and to a in is it you that he was for on are as with his they at be this
have from or one had by word but not what all were we when your can said there
use an each which she do how their if will up other about out many then them
these so some her would make like him into time has look two more write go see
number no way could people my than first water been call who oil its now find
long down day did get come made may part over new sound take only little work
know place year live me back give most very after thing our just name good
sentence man think say great where help through much before line right too
mean old any same tell boy follow came want show also around form three small
set put end does another well large must big even such because turn here why
ask went men read need land different home us move try kind hand picture again
change off play spell air away animal house point page letter mother answer
found study still learn should world high every near add food between own
below country plant last school father keep tree never start city earth eye
light thought head under story saw left few while along might close something
seem next hard open example begin life always those both paper together got
group often run important until children side feet car mile night walk white
sea began grow took river four carry state once book hear stop without second
late miss idea enough eat face watch far really almost let above girl sometimes
mountain cut young talk soon list song being leave family body music color
stand sun question fish area mark dog horse birds problem complete room knew
since ever piece told usually friends easy heard order red door sure become
top ship across today during short better best however low hours black products
happen whole measure remember early waves reached listen wind rock space covered
fast several hold himself toward five step morning passed voice true king
hundred ten hour against pattern table north slowly money map farm pulled draw
hot cold yes please thank thanks hello welcome sorry goodbye tomorrow yesterday
tonight afternoon evening week month minute minutes days years times season
weekend calendar date schedule meeting meetings appointment deadline plan plans
project projects task tasks progress status update updates report reports team
member members colleague colleagues company business office job jobs manager
customer customers client clients service services support feedback message
messages email emails address phone mobile computer keyboard screen window
windows browser internet online offline website websites site web application
applications program programs programming code coding developer developers
development software hardware system systems database server network security
privacy private public local remote version release build test testing tests
deploy deployment function functions feature features issue issues error errors
bug bugs fix fixes fixed correct correction corrections spelling grammar
language languages english chinese text texts document documents file files
folder folders data input output result results original suggestion suggestions
accept accepted ignore ignored apply applied copy copied clear undo reset
save saved edit edited editing delete remove select selected option options
setting settings button buttons click typing type typed using used user users
account password login logout sign signed request response example examples
simple simply useful available unavailable ready loading processing finished
success successful successfully failure failed valid invalid exact basic
advanced common normal natural friendly efficient efficiency performance speed
quick quickly slow current recent latest previous following content information
detail details description explain explanation reason reasons difference
improve improved improvement reduce increased increase check checked checking
review reviewed compare comparison choose choice choices change changes changed
return returned returns value values object objects string strings array arrays
boolean null undefined variable variables constant constants number numbers
format formatting style styles design layout interface responsive accessible
accessibility focus active disabled enabled enable disable event events worker
background foreground synchronous asynchronous promise promises resolve reject
import export module modules package packages dependency dependencies install
installed installation configure configuration environment production preview
terminal command commands script scripts source target targets branch branches
commit push pull merge repository repositories license licensed copyright
learn learned learning practice exercise homework lesson lessons class classes
teacher student students friend friendship parent parents child brother sister
morning happy happiness beautiful comfortable necessary definitely separate
receive received receiving believe believed achieve achieved piece pieces
experience experienced especially excellent interesting interested usually
actually probably possibly maybe certainly everything everyone everybody
someone somebody anyone anything nothing nobody somewhere somewhere
occasion occasion occasion business tomorrow immediately beginning writing
written beginning argument arguments environment maintenance independent
recommend recommended recommendation appreciate appreciated opportunity
opportunities successful sincerely sincerely unfortunately fortunately
accommodation restaurant restaurants delicious breakfast lunch dinner coffee
tea milk juice bread apple apples orange oranges banana fruit vegetables
rice noodles chicken beef pork soup sandwich sandwiches pizza chocolate
drink drinking hungry tired sleep sleeping wake awake rest relax travel trip
train bus station ticket tickets airport airplane bicycle bike walking running
drive driving road street park garden beach mountains weather sunny rainy rain
snow cloudy clouds warm cool beautiful wonderful lovely amazing fantastic
nice fine bad worse wrong correct true false real really quite rather pretty
very extremely completely entirely totally already yet still just ago later
soon perhaps instead otherwise therefore although though despite unless
whether either neither both also else include includes including included
contain contains containing create creates created creating allow allows
allowed allowing provide provides provided providing consider considered
considering understand understood understanding explain explains explained
said says saying speak speaks speaking spoken talk talks talking told tells
teach taught learn learns learning send sends sent sending received receives
read reads reading writes writing written wrote make makes making made
has have having am is are was were been being do does did done doing
shall should will would can could may might must ought need needs needed
don't doesn't didn't isn't aren't wasn't weren't haven't hasn't hadn't
won't wouldn't can't couldn't shouldn't i'm you're we're they're it's
that's there's here's i've you've we've they've i'll you'll we'll they'll
i'd you'd we'd they'd isn't let's who's what's how's where's
analyze analyse analysis algorithm algorithms edit distance candidate candidates
dictionary dictionaries pronunciation phonetic tone tones traditional simplified
unicode emoji whitespace punctuation paragraph paragraphs sentence sentences
boundary boundaries offset offsets character characters words word count
bun vite typescript javascript firebase github grammend node npm html css json
api http https url urls utf markdown react vue svelte rust python java sql
university universities uniform unique union unit units united unicorn user
useful usual european one once honest honestly hour hours honor honour heir
innovation elegant minimal secure safety reliable robust intentional preserve
`.trim().split(/\s+/);

export const MISSPELLINGS: Record<string, string> = {
  teh: "the",
  hte: "the",
  thier: "their",
  taht: "that",
  tihs: "this",
  wiht: "with",
  wtih: "with",
  adn: "and",
  nad: "and",
  becuase: "because",
  becasue: "because",
  beacuse: "because",
  becausee: "because",
  recieve: "receive",
  recieved: "received",
  recieving: "receiving",
  beleive: "believe",
  belive: "believe",
  acheive: "achieve",
  definately: "definitely",
  definitly: "definitely",
  definetly: "definitely",
  seperate: "separate",
  seperately: "separately",
  grammer: "grammar",
  langauge: "language",
  sentance: "sentence",
  sentances: "sentences",
  spellling: "spelling",
  writting: "writing",
  comming: "coming",
  begining: "beginning",
  occured: "occurred",
  occuring: "occurring",
  occurence: "occurrence",
  untill: "until",
  tommorow: "tomorrow",
  tommorrow: "tomorrow",
  yesturday: "yesterday",
  freind: "friend",
  freinds: "friends",
  frend: "friend",
  peopel: "people",
  poeple: "people",
  pleace: "please",
  plese: "please",
  thansk: "thanks",
  tihnk: "think",
  knwo: "know",
  woudl: "would",
  shoudl: "should",
  coudl: "could",
  wrold: "world",
  wierd: "weird",
  buisness: "business",
  busines: "business",
  adress: "address",
  addres: "address",
  enviroment: "environment",
  enviornment: "environment",
  independant: "independent",
  neccessary: "necessary",
  necesary: "necessary",
  sucess: "success",
  succes: "success",
  sucessful: "successful",
  succesful: "successful",
  sucessfully: "successfully",
  usefull: "useful",
  helpfull: "helpful",
  beautifull: "beautiful",
  wonderfull: "wonderful",
  intresting: "interesting",
  intersting: "interesting",
  diffrent: "different",
  diffrence: "difference",
  importent: "important",
  informaiton: "information",
  informtion: "information",
  mesage: "message",
  messsage: "message",
  featre: "feature",
  feautre: "feature",
  featuer: "feature",
  funciton: "function",
  fucntion: "function",
  udpate: "update",
  udpated: "updated",
  defualt: "default",
  flase: "false",
  ture: "true",
  retrun: "return",
  lenght: "length",
  heigth: "height",
  widht: "width",
  reponse: "response",
  respose: "response",
  reqeust: "request",
  documment: "document",
  docuemnt: "document",
  availabe: "available",
  avaialble: "available",
  accout: "account",
  passowrd: "password",
  passwrod: "password",
  acutally: "actually",
  alot: "a lot",
  doesnt: "doesn't",
  dont: "don't",
  didnt: "didn't",
  isnt: "isn't",
  arent: "aren't",
  havent: "haven't",
  hasnt: "hasn't",
  couldnt: "couldn't",
  wouldnt: "wouldn't",
  shouldnt: "shouldn't",
};
