import { ComponentFixture, TestBed } from '@angular/core/testing';

import { DailyProductionComponent } from './daily-production';

describe('DailyProductionComponent', () => {
  let component: DailyProductionComponent;
  let fixture: ComponentFixture<DailyProductionComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [DailyProductionComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(DailyProductionComponent);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
