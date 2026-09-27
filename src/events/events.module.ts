import { Module } from '@nestjs/common';
import { SlotEventsGateway } from './slot-events.gateway';

@Module({ providers: [SlotEventsGateway], exports: [SlotEventsGateway] })
export class EventsModule {}
