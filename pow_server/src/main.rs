use actix_web::{web, App, HttpResponse, HttpServer, Responder, post};
use serde::Deserialize;
use std::str::FromStr;

use nostr::prelude::*;

#[derive(Deserialize)]
struct EventContent {
    // tags: Vec<Vec<String>>,
    content: String,
    pubkey: String,
}

#[derive(Deserialize)]
struct PowRequest {
    req_event: EventContent,
    difficulty: String,
}

#[post("/powgen")]
async fn pow_handler(pow_request: web::Json<PowRequest>) -> impl Responder {
    let pubkey = match XOnlyPublicKey::from_str(&pow_request.req_event.pubkey) {
        Ok(pubkey) => pubkey,
        Err(_) => return HttpResponse::BadRequest().finish(),
    };
    let difficulty = match u8::from_str(&pow_request.difficulty) {
        Ok(difficulty) => difficulty,
        Err(_) => return HttpResponse::BadRequest().finish(),
    };

    let builder = EventBuilder::new_text_note(&pow_request.req_event.content, &[]);
    let event = builder.to_unsigned_pow_event(pubkey, difficulty);

    HttpResponse::Ok().json(event)
}


#[actix_web::main]
async fn main() -> std::io::Result<()> {
    HttpServer::new(|| {
        App::new()
            .service(pow_handler)
    })
    .bind("127.0.0.1:8080")?
    .run()
    .await
}