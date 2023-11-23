const express = require("express");
const app = express();
const { open } = require("sqlite");
const sqlite3 = require("sqlite3");
const path = require("path");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const dbPath = path.join(__dirname, "twitterClone.db");
//const format = require("date-fns/format");

let db = null;
const initializeDbAndServer = async () => {
  try {
    db = await open({
      filename: dbPath,
      driver: sqlite3.Database,
    });
    app.listen(3000, () => {
      console.log("Server is running at http://localhost:3000");
    });
  } catch (e) {
    console.log(`Error: '${e.message}'`);
    process.exit(1);
  }
};
initializeDbAndServer();
app.use(express.json());

const isValidPassword = (password) => {
  return password.length >= 6;
};

//API 1
app.post("/register/", async (request, response) => {
  const { username, password, name, gender } = request.body;
  const checkUserPresenceQuery = `
    SELECT *
    FROM user
    WHERE username = '${username}';`;
  const dbUser = await db.get(checkUserPresenceQuery);
  if (dbUser === undefined) {
    if (isValidPassword(password)) {
      const hashedPassword = await bcrypt.hash(password, 10);
      const createUserQuery = `
            INSERT INTO 
            user(username,password,gender,name)
            VALUES (
                '${username}',
                '${hashedPassword}',
                '${gender}',
                '${name}'
            );`;
      await db.run(createUserQuery);
      response.status(200);
      response.send("User created successfully");
    } else {
      response.status(400);
      response.send("Password is too short");
    }
  } else {
    response.status(400);
    response.send("User already exists");
  }
});

//API 2
app.post("/login/", async (request, response) => {
  const { username, password } = request.body;
  const checkUserPresence = `
    SELECT *
    FROM user
    WHERE username = '${username}';`;
  const dbUser = await db.get(checkUserPresence);
  if (dbUser === undefined) {
    response.status(400);
    response.send("Invalid user");
  } else {
    const isValidPassword = await bcrypt.compare(password, dbUser.password);
    if (isValidPassword) {
      const payload = { username };
      const jwtToken = jwt.sign(payload, "MY_SECRET_TOKEN");
      response.send({ jwtToken });
    } else {
      response.status(400);
      response.send("Invalid password");
    }
  }
});

const authenticateToken = (request, response, next) => {
  let jwtToken;
  const authHeader = request.headers["authorization"];
  if (authHeader !== undefined) {
    jwtToken = authHeader.split(" ")[1];
  }
  if (jwtToken === undefined) {
    response.status(401);
    response.send("Invalid JWT Token");
  } else {
    jwt.verify(jwtToken, "MY_SECRET_TOKEN", async (error, payload) => {
      if (error) {
        response.status(401);
        response.send("Invalid JWT Token");
      } else {
        request.username = payload.username;
        next();
      }
    });
  }
};

//API 3

app.get("/user/tweets/feed/", authenticateToken, async (request, response) => {
  const { username } = request;
  const getQuery = `
    SELECT u2.username AS username,t.tweet AS tweet,t.date_time AS dateTime
    FROM (user AS u1 INNER JOIN follower AS f ON u1.user_id = f.follower_user_id)
    INNER JOIN tweet AS t ON f.following_user_id = t.user_id
    INNER JOIN user AS u2 ON t.user_id = u2.user_id
    WHERE u1.username = '${username}'
    ORDER BY t.date_time DESC
    LIMIT 4
;`;
  const getAllResponse = await db.all(getQuery);
  response.send(getAllResponse);
});

//API 4

app.get("/user/following/", authenticateToken, async (request, response) => {
  const { username } = request;
  const getAllNames = `
    SELECT u2.name AS name
    FROM (user AS u1 INNER JOIN follower ON u1.user_id = follower.follower_user_id) AS T 
    INNER JOIN user AS u2 ON T.following_user_id = u2.user_id 
    WHERE u1.username = '${username}';`;
  const dbResponse = await db.all(getAllNames);
  response.send(dbResponse);
});

//API 5
app.get("/user/followers/", authenticateToken, async (request, response) => {
  const { username } = request;
  const getFollowersQuery = `
    SELECT u2.name AS name
    FROM (user AS u1 INNER JOIN follower ON u1.user_id = follower.following_user_id) AS T 
    INNER JOIN user AS u2 ON T.follower_user_id = u2.user_id
    WHERE u1.username = '${username}'`;
  const dbResponse = await db.all(getFollowersQuery);
  response.send(dbResponse);
});

//API 6
app.get("/tweets/:tweetId/", authenticateToken, async (request, response) => {
  const { username } = request;
  const { tweetId } = request.params;
  const getQuery = `
    SElECT t1.tweet AS tweet,COUNT(DISTINCT l.like_id) AS likes,COUNT(DISTINCT r.reply_id) AS replies,t1.date_time AS dateTime
    FROM (user AS u1 INNER JOIN follower ON u1.user_id = follower.follower_user_id) AS T 
    INNER JOIN tweet t1 ON T.following_user_id = t1.user_id 
    INNER JOIN like l ON t1.tweet_id = l.tweet_id 
    INNER JOIN reply r ON t1.tweet_id = r.tweet_id 
    WHERE u1.username = '${username}' and t1.tweet_id = ${tweetId};`;
  const dbResponse = await db.get(getQuery);
  if (dbResponse.tweet === null) {
    response.status(401);
    response.send("Invalid Request");
  } else {
    response.send(dbResponse);
  }
});
const isValid = async (username, tweetId) => {};
//API 7
app.get(
  "/tweets/:tweetId/likes/",
  authenticateToken,
  async (request, response) => {
    const { username } = request;
    const { tweetId } = request.params;
    const invalidTweet = `
    SElECT *
    FROM (user AS u1 INNER JOIN follower ON u1.user_id = follower.follower_user_id) AS T 
    INNER JOIN tweet t1 ON T.following_user_id = t1.user_id 
    WHERE u1.username = '${username}' and t1.tweet_id = ${tweetId};`;
    const dbResponse = await db.get(invalidTweet);
    if (dbResponse === undefined) {
      response.status(401);
      response.send("Invalid Request");
    } else {
      const getQuery = `
    SElECT u2.username
    FROM (user AS u1 INNER JOIN follower ON u1.user_id = follower.follower_user_id) AS T 
    INNER JOIN tweet t1 ON T.following_user_id = t1.user_id 
    INNER JOIN like l ON t1.tweet_id = l.tweet_id 
    INNER JOIN user u2 ON l.user_id = u2.user_id
    WHERE u1.username = '${username}' and t1.tweet_id = ${tweetId};`;
      const dbResponse = await db.all(getQuery);
      newList = [];
      dbResponse.map((eachUser) => {
        newList.push(eachUser.username);
      });
      response.send({ likes: newList });
    }
  }
);

//API 8
app.get(
  "/tweets/:tweetId/replies/",
  authenticateToken,
  async (request, response) => {
    const { username } = request;
    const { tweetId } = request.params;
    const invalidTweet = `
    SElECT *
    FROM (user AS u1 INNER JOIN follower ON u1.user_id = follower.follower_user_id) AS T 
    INNER JOIN tweet t1 ON T.following_user_id = t1.user_id 
    WHERE u1.username = '${username}' and t1.tweet_id = ${tweetId};`;
    const dbResponse = await db.get(invalidTweet);
    if (dbResponse === undefined) {
      response.status(401);
      response.send("Invalid Request");
    } else {
      const getQuery = `
    SElECT u2.name AS name,r.reply
    FROM (user AS u1 INNER JOIN follower ON u1.user_id = follower.follower_user_id) AS T 
    INNER JOIN tweet t1 ON T.following_user_id = t1.user_id 
    INNER JOIN reply r ON t1.tweet_id = r.tweet_id 
    INNER JOIN user u2 ON r.user_id = u2.user_id
    WHERE u1.username = '${username}' and t1.tweet_id = ${tweetId};`;
      const dbResponse = await db.all(getQuery);
      newList = [];
      dbResponse.map((eachUser) => {
        newList.push(eachUser);
      });
      response.send({ replies: newList });
    }
  }
);

//API 9
app.get("/user/tweets/", authenticateToken, async (request, response) => {
  const { username } = request;
  const getAllTweetsQuery = `
    SELECT t1.tweet AS tweet,COUNT(DISTINCT l.like_id) AS likes,COUNT(DISTINCT r.reply_id) AS replies,t1.date_time AS dateTime
    FROM (user AS u1 INNER JOIN tweet AS t1 ON u1.user_id = t1.user_id) AS T
    INNER JOIN like AS l ON t1.tweet_id = l.tweet_id
    INNER JOIN reply AS r ON t1.tweet_id = r.tweet_id
    WHERE u1.username = '${username}'
    GROUP BY t1.tweet_id;`;
  const dbResponse = await db.all(getAllTweetsQuery);
  response.send(dbResponse);
});

//API 10
app.post("/user/tweets/", authenticateToken, async (request, response) => {
  const { username } = request;
  const getUserIdQuery = `
  SELECT *
  FROM user 
  WHERE username = '${username}';`;
  const { user_id } = await db.get(getUserIdQuery);
  const { tweet } = request.body;
  //let current_date = format(new Date(), "yyyy-MM-dd HH:mm:ss");
  const newQuery = `
  SELECT *
  FROM tweet;`;
  const newResponse = await db.all(newQuery);
  let new_id = newResponse.length + 1;
  const addTweetQuery = `
  INSERT INTO 
  tweet(tweet_id,tweet,user_id,date_time)
  VALUES(
      ${new_id},
    '${tweet}',
    ${user_id},
    '${2023 - 11 - 23}'
  );`;
  await db.run(addTweetQuery);
  response.send("Created a Tweet");
});
//API 11
app.delete(
  "/tweets/:tweetId/",
  authenticateToken,
  async (request, response) => {
    const { username } = request;
    const { tweetId } = request.params;
    const isOwnTweetQuery = `
    SELECT *
    FROM (user AS u1 INNER JOIN tweet AS t ON u1.user_id = t.user_id)
    WHERE u1.username = '${username}' and t.tweet_id = ${tweetId};`;
    const dbResponse = await db.get(isOwnTweetQuery);
    if (dbResponse === undefined) {
      response.status(401);
      response.send("Invalid Request");
    } else {
      const deleteQuery = `
        DELETE FROM tweet 
        WHERE tweet_id = ${tweetId};`;
      await db.run(deleteQuery);
      response.send("Tweet Removed");
    }
  }
);
module.exports = app;
