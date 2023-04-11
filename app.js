const express = require("express");
const { open } = require("sqlite");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const path = require("path");

const sqlite3 = require("sqlite3");
const app = express();
app.use(express.json());

const dbPath = path.join(__dirname, "twitterClone.db");
let db = null;
const initializeDBAndServer = async () => {
  try {
    db = await open({
      filename: dbPath,
      driver: sqlite3.Database,
    });
    app.listen(3001, () => {
      console.log("Server Running at http://localhost:3001/");
    });
  } catch (e) {
    console.log(`DB Error: '${e.message}'`);
    process.exit(1);
  }
};
initializeDBAndServer();

// get register api 1
app.post("/register/", async (request, response) => {
  const { username, name, password, gender } = request.body;
  const hashedPassword = await bcrypt.hash(request.body.password, 10);
  const usernameQuery = `select * from user where username='${username}';`;
  const userName = await db.get(usernameQuery);
  if (userName === undefined) {
    if (password.length < 6) {
      response.status(400);
      response.send("Password is too short");
    } else {
      const dbQuery = `insert into user 
             (username,password,name,gender) 
             values ('${username}','${hashedPassword}','${name}','${gender}');`;
      await db.run(dbQuery);
      response.status(200);
      response.send("User created successfully");
    }
  } else {
    response.status(400);
    response.send("User already exists");
  }
});

//login api 2
app.post("/login/", async (request, response) => {
  const { username, password } = request.body;
  const getUserQuery = `select * from user where username='${username}';`;
  const dbUser = await db.get(getUserQuery);
  if (dbUser === undefined) {
    response.status(400);
    response.send("Invalid user");
  } else {
    const comparePassword = await bcrypt.compare(password, dbUser.password);
    if (comparePassword === true) {
      response.status(200);
      const payload = {
        username: username,
      };
      const jwtToken = jwt.sign(payload, "token");
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
    jwt.verify(jwtToken, "token", async (error, payload) => {
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

//get user/tweets/feed api 3;
app.get("/user/tweets/feed/", authenticateToken, async (request, response) => {
  const userTweetQuery = `select distinct user.username,t.tweet,t.date_time as dateTime from 
    (follower inner join tweet on follower.following_user_id=tweet.user_id)
    as t inner join user on t.user_id=user.user_id 
    order by dateTime desc limit 4;`;
  const getUserTweetQuery = await db.all(userTweetQuery);
  response.send(getUserTweetQuery);
});

// get api 4
app.get("/user/following/", authenticateToken, async (request, response) => {
  const { username } = request;
  const userQuery = `select user_id from user where username='${username}';`;
  const getUserQuery = await db.get(userQuery);
  const namesQuery = `select user.name from user inner join follower on follower.following_user_id=user.user_id where follower.follower_user_id=${getUserQuery.user_id};`;
  const dbNamesQuery = await db.all(namesQuery);
  response.send(dbNamesQuery);
});

// get api 5
app.get("/user/followers/", authenticateToken, async (request, response) => {
  const { username } = request;
  const userQuery = `select user_id from user where username='${username}';`;
  const getUserQuery = await db.get(userQuery);
  const namesQuery = `select user.name from user inner join follower on follower.follower_user_id=user.user_id where follower.following_user_id=${getUserQuery.user_id};`;
  const dbNamesQuery = await db.all(namesQuery);
  response.send(dbNamesQuery);
});

// get api 6
app.get("/tweets/:tweetId/", authenticateToken, async (request, response) => {
  const { username } = request;
  const { tweetId } = request.params;
  const userQuery = `select user_id from user where username='${username}';`;
  const getUserQuery = await db.get(userQuery);

  const followUserQuery = `select following_user_id from follower where follower_user_id=${getUserQuery.user_id};`;
  const getFollowUserQuery = await db.get(followUserQuery);

  const userIdQuery = `select user_id from tweet where tweet_id=${tweetId};`;
  const getUserIdQuery = await db.get(userIdQuery);
  if (getUserIdQuery.user_id === getFollowUserQuery.following_user_id) {
    const tweetDetails = `select tweet.tweet,
    count(like.like_id) as likes,
    count(reply.reply_id) as replies,
    tweet.date_time as dateTime 
    from (tweet inner join like on tweet.tweet_id=like.tweet_id ) as T 
    inner join reply 
    on T.tweet_id=reply.tweet_id 
    where tweet.tweet_id=${tweetId};`;
    const getTweetDetails = await db.get(tweetDetails);
    response.send(getTweetDetails);
  } else {
    response.status(401);
    response.send("Invalid Request");
  }
});

//get api 7
app.get(
  "/tweets/:tweetId/likes/",
  authenticateToken,
  async (request, response) => {
    const { username } = request;
    const { tweetId } = request.params;
    const userQuery = `select user_id from user where username='${username}';`;
    const getUserQuery = await db.get(userQuery);

    const followUserQuery = `select following_user_id from follower where follower_user_id=${getUserQuery.user_id};`;
    const getFollowUserQuery = await db.get(followUserQuery);

    const userIdQuery = `select user_id from tweet where tweet_id=${tweetId};`;
    const getUserIdQuery = await db.get(userIdQuery);
    if (getUserIdQuery.user_id === getFollowUserQuery.following_user_id) {
      const likesQuery = `select user.name as likes 
      from user inner join like 
      on user.user_id=like.like_id where like.tweet_id=${tweetId};`;
      const getLikesQuery = await db.get(likesQuery);
      response.send(getLikesQuery);
    } else {
      response.status(401);
      response.send("Invalid Request");
    }
  }
);

module.exports = app;
