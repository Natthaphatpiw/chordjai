import {passportEmergency} from '@chordjai/contracts';

/** A blocked draft is not evidence that the owner reported an emergency. */
export function blockedChatReply(userText:string,language:'th'|'en'){
  const emergency=passportEmergency(userText,{},language);
  if(emergency.urgent)return emergency.message;
  const planned=/(?:จะพา|กำลังจะพา|เตรียมพา|วางแผน.{0,15}พา)|\b(?:planning to|going to|will take|taking .{0,30}to (?:the )?vet)\b/iu.test(userText);
  if(planned)return language==='th'
    ?'รับทราบครับ ตอนนี้เป็นแผนที่จะพาน้องไปดูแล ยังไม่ถือว่าได้รับการรักษาแล้ว หากอยากเก็บไว้ พิมพ์ว่า “บันทึกไดอารี่ให้หน่อย” พร้อมรายละเอียดที่อยากจดได้ครับ หลังพบหมอค่อยเพิ่มสิ่งที่หมอบอกและค่าใช้จ่ายตามจริงได้'
    :'Understood — this is a planned visit, not treatment that has already happened. To keep it, say “Please save this in the care diary” and include the details you want recorded. After the visit, you can add what the vet said and the actual cost.';
  return language==='th'
    ?'เรื่องการเลือกยาและขนาดยาให้สัตวแพทย์ประเมินโดยตรงนะครับ คุณเล่าอาการ สิ่งที่หมอบอก หรือเรื่องที่อยากเตรียมไปคุยกับหมอต่อได้ หากอยากเก็บไว้ พิมพ์ว่า “บันทึกไดอารี่ให้หน่อย” พร้อมรายละเอียดได้ครับ'
    :'Please let a veterinarian assess medicines and doses directly. You can tell me what you noticed, what your vet said, or what you want to discuss at the visit. To keep it, say “Please save this in the care diary” and include the details.';
}
